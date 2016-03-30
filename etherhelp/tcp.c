//Copyright 2012 <>< Charles Lohr, under the MIT-x11 or NewBSD license.  You choose.
//
//Remaining TODO
//
//* TCP Keepalive.
//* Handle FIN correctly.

#include "tcp.h"

#define MARK(x,...)

#ifdef INCLUDE_TCP

struct tcpconnection TCPs[TCP_SOCKETS];

#define POP et_pop8()
#define POP16 et_pop16()
#define PUSH(x) et_push8(x)
#define PUSH16(x) et_push16(x)
#define PUSHB(x,s) et_pushblob(x,s)

//Consider putting these in the core stack.
static ICACHE_FLASH_ATTR uint32_t POP32()
{
	uint32_t ret = ((uint32_t)POP)<<24;
	ret |= ((uint32_t)POP)<<16;
	ret |= ((uint32_t)POP)<<8;
	ret |= ((uint32_t)POP);
	return ret;
}

static ICACHE_FLASH_ATTR void PUSH32( uint32_t o )
{
	PUSH( o >> 24 );
	PUSH( ( o >> 16 ) & 0xFF );
	PUSH( ( o >> 8 ) & 0xFF );
	PUSH( ( o ) & 0xFF );
}

static ICACHE_FLASH_ATTR int8_t GetAssociatedPacket()
{
	int8_t ret, i;
	struct tcpconnection * t = &TCPs[0];

	for( i = 1; i < TCP_SOCKETS; i++ )
	{
		t++;
		if( t->state && t->this_port == localport && t->dest_port == remoteport && t->dest_addr == *((uint32_t*)&ipsource[0]) )
		{
			return i;
		}
	}
	return 0;
}

static void ICACHE_FLASH_ATTR write_tcp_header( uint8_t c )
{
	struct tcpconnection * t = &TCPs[c];

	et_startsend( t->sendptr );

//We cannot send etherlink header otherwise we may misdirect our packets.
//	send_etherlink_header( 0x0800 );
	PUSHB( t->remote_mac, 6 );
	PUSHB( MyMAC, 6 );

	PUSH16( 0x0800 );

	send_ip_header( 0x00, (const uint8_t *)&t->dest_addr, TCP_PROTOCOL_NUMBER ); //Size, etc. will be filled into IP header later.
	PUSH16( t->this_port );
	PUSH16( t->dest_port );
	PUSH32( t->seq_num );
//	PUSH32( (t->sendtype&ACKBIT)?t->ack_num:0 );
	PUSH32( t->ack_num );
	PUSH( (TCP_HEADER_LENGTH/4)<<4 ); //Data offset, reserved, NS flags all 0

	PUSH( t->sendtype );

//	PUSH16( (MAX_FRAMELEN-52) ); //window
	PUSH16( 2048 ); //window
//	PUSH16( (8192) );

	PUSH16( 0x0000 ); //checksum

	PUSH16( 0x0000 ); //Urgent (no)
}

static void ICACHE_FLASH_ATTR UpdateRemoteMAC( uint8_t * c )
{
	c[0] = macfrom[0];
	c[1] = macfrom[1];
	c[2] = macfrom[2];
	c[3] = macfrom[3];
	c[4] = macfrom[4];
	c[5] = macfrom[5];
}

//////////////////////////EXTERNAL CALLABLE FUNCTIONS//////////////////////////

void ICACHE_FLASH_ATTR InitTCP()
{
	uint8_t i;
	for( i = 0; i < TCP_SOCKETS; i++ )
	{
		struct tcpconnection * t = &TCPs[i];
		t->state = 0;
	}
}


void ICACHE_FLASH_ATTR HandleTCP(uint16_t iptotallen)
{
	// ipsource is a global
	int rsck = GetAssociatedPacket();
	struct tcpconnection * t = &TCPs[rsck];

	uint32_t sequence_num = POP32();
	uint32_t ack_num = POP32();

	uint8_t hlen = (POP>>2) & 0xFC;
	uint8_t flags = POP;
	uint16_t window_size = POP16;

	POP16;  //Checksum
	POP16;  //Urgent PTR

	iptotallen -= hlen;

	//Clear out rest of header
	hlen -= 20;
	while( hlen-- )
		POP;

#ifdef TCP_HAS_SERVER
	if( flags & SYNBIT )	//SYN
	{
		struct tcpconnection * t;
		int8_t rsck = et_TCPReceiveSyn( localport );

		if( rsck == 0 ) goto reset_conn0;
		t = &TCPs[rsck];

		UpdateRemoteMAC( t->remote_mac );

		t->this_port = localport;
		t->dest_port = remoteport;
		t->dest_addr = *((uint32_t*)ipsource);
		t->ack_num = sequence_num + 1;
		t->seq_num = 0xAAAAAAAA; //should be random?
		t->state = ESTABLISHED;
		t->time_since_sent = 0;
		t->idletime = 0;

		//Don't forget to send a syn,ack back to the host.

		et_finish_callback_now();

		t->sendtype = SYNBIT | ACKBIT; //SYN+ACK
		et_StartTCPWrite( rsck );

		t->seq_num++;
//		t->seq_num = t->seq_num;

		//The syn overrides everything, so we can return.

		MARK( "__syn %d\n", rsck);
		goto end_and_emit;
	}
#endif

	UpdateRemoteMAC( t->remote_mac );

	//If we don't have a real connection, we're going to have to bail here.
	if( !rsck )
	{
		//XXX: Tricky: Do we have to reject spurious ACK packets?  Perhaps they are from keepalive
		if( flags & ( PSHBIT | SYNBIT | FINBIT ) )
		{
			MARK( "__reset0" );
			goto reset_conn0;
		}
		else
		{
			et_finish_callback_now();
			return;
		}
	}

	if( flags & RSTBIT)
	{
		et_TCPConnectionClosing( rsck );
		t->sendtype = RSTBIT | ACKBIT;
		t->state = 0;
		MARK( "__rstbit %d\n", rsck );
		goto send_early;
	}

	//We have an associated connection on T.

	if( flags & ACKBIT ) //ACK
	{
		//t->sendlength - 34 - 20
		uint16_t payloadlen = t->sendlength - 34 - 20;
		uint32_t nextseq = t->seq_num;
		if( payloadlen == 0)
			nextseq ++;               //SEQ NUM
		else
			nextseq += payloadlen;   //SEQ NUM

		int16_t diff = ack_num - nextseq;// + iptotallen; // I don't know about this part)

		//Lost a packet...
		if( diff < 0 )
		{
			MARK( "__badack %d", rsck );
		}
		//XXX TODO THIS IS PROBABLY WRONG  (was <=, meaning it could throw away packets)
		else if( diff == 0 )
		{
			//t->seq_num = ack_num; //SEQ_NUM  This seems more like a bandaid.
			//The above line seems to be useful for bandaiding errors, when doing a more complete check, uncomment it.
			t->idletime = 0;
			t->time_since_sent = 0;
			t->seq_num = nextseq;
			//t->seq_num = t->seq_num;
//			MARK( "__goodack" );
		}
	}

	if( flags & FINBIT )
	{
		if( t->state == CLOSING_WAIT )
		{
			t->sendtype = ACKBIT;
			t->ack_num = sequence_num+1;
			t->state = 0;
			MARK( "__clodone %d", rsck );
			goto send_early;
		}
		else
		{
			//XXX TODO Handle FIN correctly.
			t->ack_num++;              //SEQ NUM
			t->sendtype = ACKBIT | FINBIT;
			t->state = CLOSING_WAIT;
			et_TCPConnectionClosing( rsck );
			MARK( "__finbit %d\n", rsck );
			goto send_early;
		}
	} else if( t->state == CLOSING_WAIT )
	{
		t->state = 0;
		goto send_early;
	}




	//XXX: TODO: Consider if time_since_sent is still set...
	//This is because if we have a packet that was lost, we can't plough over it with an ack.
	//If we do, the packet will be lost, and we will be out-of-sync.

	//TODO: How do we handle PDU's?  They are sent across multiple packets.  Should we supress ACKs until we have a full PDU?
	//if( flags & PSHBIT ) //PSH 
	if( iptotallen )
	{
		if( t->ack_num == sequence_num )
		{
			//t->ack_num = sequence_num;   //XXX TODO remove this?
			if( iptotallen > 0 )
			{
				t->ack_num += iptotallen;
			}
			else
			{
				t->ack_num++; //Is this needed?
			}

			if( !et_TCPReceiveData( rsck, iptotallen ) )
			{
				if( t->time_since_sent )
				{
					//hacky, we need to send an ack, but we can't overwrite the existing packet.
					TCPs[0].seq_num = t->seq_num;//t->seq_num;
					TCPs[0].ack_num = t->ack_num;
					TCPs[0].sendtype = ACKBIT;
					rsck = 0;
					goto send_early;
				}
				else
				{
					t->sendtype = ACKBIT;
					goto send_early;
				}
			}
			else
			{
				//Do nothing
			}
		}
		else
		{
			//Otherwise, discard packet.
		}
	}

	et_finish_callback_now();
	return;

reset_conn0:
	rsck = 0;
	TCPs[0].ack_num = sequence_num;
	TCPs[0].seq_num = ack_num;
	TCPs[0].sendtype = RSTBIT | FINBIT | ACKBIT;
	TCPs[0].state = 0;

send_early: //This requires a RST to be sent back.
	et_finish_callback_now();

	if( rsck == 0)
	{
		TCPs[0].dest_addr = *((uint32_t*)ipsource);
		TCPs[0].dest_port = remoteport;
		TCPs[0].this_port = localport;
	}
	write_tcp_header( rsck );
end_and_emit:
	et_EndTCPWrite( rsck );
	//EmitTCP( rsck );
}

int8_t ICACHE_FLASH_ATTR et_GetFreeConnection()
{
	uint8_t i;
	for( i = 1; i < TCP_SOCKETS; i++ )
	{
		struct tcpconnection * t = &TCPs[i];
		if( !t->state )
		{
			ets_memset( t, 0, sizeof( struct tcpconnection ) );
			t->sendptr = TX_SCRATCHPAD_END + TCP_BUFFERSIZE * (i-1);
			return i;
		}
	}
	return 0;
}

void ICACHE_FLASH_ATTR TickTCP()
{
	uint8_t i;
	for( i = 0; i < TCP_SOCKETS; i++ )
	{
		struct tcpconnection * t = &TCPs[i];


		if( !t->state )
			continue;

		t->idletime++;

		//XXX: TODO: Handle timeout

		if( !t->time_since_sent )
			continue;

		t->time_since_sent++;

		if( t->time_since_sent > TCP_TICKS_BEFORE_RESEND )
		{
			//printf( "RESEND\n" );
			if( t->state == CLOSING_WAIT )
			{
				MARK( "__Closeout %d\n", i );
				t->state = 0;
				continue;
			}
			et_xmitpacket( t->sendptr, t->sendlength );

			t->time_since_sent = 1;
			if( t->retries++ > TCP_MAX_RETRIES )
			{
				MARK( "__rexmit %d\n", i );
				et_TCPConnectionClosing( i );
				t->state = 0;
			}
		}
	}
}

//XXX TODO This needs to be done better.
void ICACHE_FLASH_ATTR et_RequestClosure( uint8_t c )
{
	if( !TCPs[c].state || TCPs[c].state == CLOSING_WAIT ) return;
	TCPs[c].sendtype = FINBIT|ACKBIT;//RSTBIT;

	TCPs[c].state = CLOSING_WAIT;
	TCPs[c].time_since_sent = 0;

	MARK("__req_closure %d\n", c);
//	TCPs[c].seq_num--; //???
	et_StartTCPWrite( c );
	et_EndTCPWrite( c );	
}


uint8_t ICACHE_FLASH_ATTR et_TCPCanSend( uint8_t c )
{
//	printf( "ESTW %d %d\n", c, TCPs[c].time_since_sent );
	return !TCPs[c].time_since_sent;
}

void ICACHE_FLASH_ATTR et_StartTCPWrite( uint8_t c )
{
	write_tcp_header( c );
}

void ICACHE_FLASH_ATTR et_EndTCPWrite( uint8_t c )
{
	struct tcpconnection * t = &TCPs[c];
	unsigned short length;
//	unsigned short payloadlen;
	unsigned short base = t->sendptr;

	et_stopop();

	length = et_get_write_length() - 6;
	t->sendlength = length;
//	payloadlen = length - 34 - 20;
	if( t->sendtype & ( PSHBIT | SYNBIT | FINBIT ) ) //PSH, SYN, RST or FIN packets
	{
		t->time_since_sent = 1;
		t->retries = 0;
	}

	//Write length in IP header

	et_FinishTCPPacket( length-14 );

	et_endsend( );

#ifdef TCP_DOUBLESEND
	uint16_t nps = NetGetScratch();
	et_copy_memory( nps, t->sendptr, 55, 0, 65535 );
	et_startsend( nps );
	et_stopop();
	et_alter_word( 18+6, 0x0000 );
	et_FinishTCPPacket( 40 );
	et_xmitpacket( nps, 55 );
#endif

}

void ICACHE_FLASH_ATTR et_FinishTCPPacket( uint16_t length )
{
	et_alter_word( 10+6, length );

#ifndef AUTO_CHECKSUMS
	uint16_t ppl, ppl2;
	et_start_checksum( 8+6, 20 );
	ppl = et_get_checksum();
	et_alter_word( 18+6, ppl );

	//Calc TCP checksum
	//Initially, write pseudo-header into the checksum area
	et_alter_word( 0x2C+6, TCP_PROTOCOL_NUMBER + length - 20 );

	et_start_checksum( 20+6, length - 12 );
	ppl2 = et_get_checksum();

	et_alter_word( 0x2C+6, ppl2 );
#endif
}

void ICACHE_FLASH_ATTR et_EmitTCP( uint8_t c )
{
	struct tcpconnection * t = &TCPs[c];
	et_xmitpacket( t->sendptr, t->sendlength );
}


#endif
