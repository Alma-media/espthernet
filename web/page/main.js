//Copyright (C) 2015 <>< Charles Lohr, see LICENSE file for more info.
//
//This particular file may be licensed under the MIT/x11, New BSD or ColorChord Licenses.

window.addEventListener("load", KickLastPacket, false);



is_leds_running = false;
pause_led = false;

function KickLastPacket()
{
	if( IsTabOpen('LastPacket') )
	{
		//$("#LastPacketBody").html("X" );
		QueueOperation( "CK" + (document.getElementById('errpak').checked?2:1),  GotPacketLock );
	}
}

function tohex12( c )
{
	if( c == null ) return "-";
	var hex = c.toString(16);
	return hex.length == 1 ? "00" + hex : ( hex.length == 2 ? "0" + hex : hex );
}


function ToggleLastPacket()
{
	KickLastPacket();
}

var PackPlace = 0;
var Packet = [];
var PacketHex = [];
var PackByte = 0;

function RunOnScreenData()
{
	//console.log( $("#pakdat").val() );
	var pd = $("#pakdat").val();

	var pds = pd.split( /[ ,\t]+/ );
	PacketHex = [];
	Packet = [];

	for( var i = 0; i < pds.length; i++ )
	{
		var pd = pds[i];
		if( pd.substr(0,2) != "0x" ) { if( pd.length > 2 ) console.log( "Failed: " + pd ); continue; }
		var vss = pd.substr( 2 );
		var j = 0;
		var phex = "0x";
		for( j = 0; j < 8; j++ )
		{
			k = parseInt(vss[j], 16);
			Packet.push( (k & 8)?1:0 );
			Packet.push( (k & 4)?1:0 );
			Packet.push( (k & 2)?1:0 );
			Packet.push( (k & 1)?1:0 );

			kf = parseInt(vss[j], 16);
			phex += k.toString( 16 );
		}
		PacketHex.push( phex );
	}

	RunOnData();
}

function DonePacket( req, data )
{
	RunOnData();
}

function RunOnData()
{
	var divtext = "";
	var i;
	var zero_bias = true;

	divtext = "<TABLE STYLE='border:1px solid gray;border-collapse:collapse;background-color:#eeeeee'><TR><TD nowrap>Raw Hex</TD>";
	var pdout = "";
	for( i = 0; i < PacketHex.length; i++ )
	{
		var pk = PacketHex[i];
		divtext += "<TD STYLE='border:1px solid gray' COLSPAN=32>" + pk + "</TD>";
		pdout += pk + "\t";
	}
	$("#pakdat").val( pdout );

	divtext += "<TR><TD nowrap>Raw Bits</TD>";
	for( i = 0; i < Packet.length; i++ )
	{
		var pk = Packet[i];
		divtext += "<TD STYLE='border:1px solid gray;background-color:" + (pk?"#ffffff":"#000000") + ";color:"+(pk?"#000000":"#ffffff") +"'>" + (pk?"1":"0") + "</TD>";
	}
	divtext+="</TR><TR><TD nowrap>OSCope</TD>";

	var last = Packet[0];
	for( i = 0; i < Packet.length; i++ )
	{
		var pk = Packet[i];
		if( pk == last )
		{
			divtext += "<TD STYLE='border:none'><BR>" + (pk?"̅‾‾":"̲ ̲ ̲ ̲ ") + "<BR><BR></TD>";
		}
		else
		{
			divtext += "<TD STYLE='border:none'><BR>" + (pk?"|‾̅":"|_") + "<BR><BR></TD>";
		}
		last = pk;
	}

	var PLens = [];
	var IsLongs = [];
	var IsValids = [];
	var PacketState = [];
	var InPreambles = [];
	var KOBits = [];
	var KOBitLens = [];
	var in_preamble = 2;
	var last = Packet[0];
	var lastct = -1;
	var is_first = true;
	var validity_maintained = true;

	var curbit = false; //Current on/off state
	var intonation = 0;
	var firstbit = true;
	var firstbitout = false;
	var kobitlen = 0;

	for( i = 0; i < Packet.length; i++ )
	{
		var pk = Packet[i];
		if( last != pk )
		{
			var is_long = false;
			var is_valid = false;

			if( zero_bias )
			{
				if( last == 0 )
				{
					if( lastct < 1 )  //lastct = 0 for only 1, or 6 for 7.  It's one off.
					{
						is_valid = false;
						is_long = false;
					}
					else if( lastct <= 2 )
					{
						is_valid = true;
						is_long = false;
					}
					else if( lastct <= 8 )
					{
						is_valid = true;
						is_long = true;
					}
					else
					{
						is_valid = false;
					}
				}
				else
				{
					if( lastct <= 1 )  //lastct = 0 for only 1, or 6 for 7.  It's one off.
					{
						is_valid = true;
						is_long = false;
					}
					else if( lastct <= 6 )
					{
						is_valid = true;
						is_long = true;
					}
					else
					{
						is_valid = false;
					}
				}

				if( is_first )
				{
					is_long = true;
					is_valid = true;
					is_first = false;
				}

				var obits = "";

				kobitlen+=(lastct+1);

				if( in_preamble == 0 )
				{
					if( firstbit )
					{
						KOBits.push( "" );
						KOBitLens.push( kobitlen-1 - (lastct+1) + 2 ); //+2 is to approximate where the bits actually matter.
						 kobitlen = (lastct+1);
						firstbit = false;
						firstbitout = true;
					}
					if( is_long )
					{
						if( intonation )
						{
							obits = '!!!!';
							is_valid = false;
						}
						else
						{
							curbit = !curbit;
							obits = curbit?'1':'0';
						}
					}
					else
					{
						if( intonation )
						{
							intonation = false;
							obits = curbit?'1':'0';
						}
						else
						{
							intonation = true;
						}
					}

					if( obits.length )
					{
						KOBits.push( obits );
//						KOBitLens[KOBitLens.length-1] -= (kobitlen-1/2);
						KOBitLens.push( kobitlen-1 );
						kobitlen = 0;
					}
				}

				if( is_valid == false ) validity_maintained = false;
				if( validity_maintained == false ) is_valid = false;

				IsLongs.push( is_long );
				IsValids.push( is_valid );
				InPreambles.push( in_preamble );
				if( !is_long && in_preamble > 0 && i != 0 )
				{
					in_preamble--;
					curbit = true;
					firstbit = true;
					intonation = 0;
				}
			}
			else
			{
				//Not defined for non zero-bias.
			}

			PLens.push( lastct );

			last = pk;
			lastct = 0;
		}
		else
		{
			lastct++;
		}
	}

	var Chars = [''];
	var RawChars = [];
	var CharBitLens = [KOBitLens[0]+1];
	var cbl = 0;
	var bytval = 0;
	var bitct = 0;
	//Next, process 'KOBits' into chars.
	for( i = 1; i < KOBits.length; i++ )
	{
		cbl += KOBitLens[i];
		if( KOBits[i] == '0' )
		{
			bytval += 0<<bitct;
			bitct++;	
		}
		if( KOBits[i] == '1' )
		{
			bytval += 1<<bitct;
			bitct++;	
		}
		if( bitct == 8 )
		{
			bitct = 0;
			Chars.push( '0x' + tohex8( bytval ) );
			RawChars.push( bytval );
			CharBitLens.push( cbl+8 ); //+
			cbl = 0;
			bytval = 0;
			bitct = 0;
		}
	}
	

	divtext+="</TR><TR><TD nowrap>Bit Lengths</TD>";

	for( i = 0; i < PLens.length; i++ )
	{
		divtext += "<TD STYLE='border:1px solid gray' COLSPAN=" + (PLens[i]+1) + ">" + (PLens[i]+1) + "</TD>";
	}
	divtext += "<TD STYLE='border:1px solid gray' COLSPAN=" + (lastct+1) + ">" + (lastct+1) + "</TD>";
	divtext+="</TR><TR><TD nowrap>L/S</TD>";
	for( i = 0; i < IsLongs.length; i++ )
	{
		divtext += "<TD STYLE='border:1px solid gray;" + (IsLongs[i]?"background-color:blue":"background-color:gray") + "' COLSPAN=" + (PLens[i]+1) + ">" + (IsLongs[i]?'—':'.') + "</TD>";
	}
	divtext += "<TD STYLE='border:1px solid gray' COLSPAN=" + (lastct+1) + ">-</TD>";
	divtext+="</TR><TR><TD nowrap>V</TD>";
	for( i = 0; i < IsValids.length; i++ )
	{
		divtext += "<TD STYLE='border:1px solid gray;" + (IsValids[i]?"":"background-color:red") + "' COLSPAN=" + (PLens[i]+1) + ">" + (IsValids[i]?'✓':'✕') + "</TD>";
	}
	divtext += "<TD STYLE='border:1px solid gray' COLSPAN=" + (lastct+1) + ">-</TD>";

	divtext+="</TR><TR><TD nowrap>In Preamble</TD>";
	for( i = 0; i < InPreambles.length; i++ )
	{
		divtext += "<TD STYLE='border:1px solid gray;" + (InPreambles[i]?"background-color:green":"") + "' COLSPAN=" + (PLens[i]+1) + ">" + (InPreambles[i]?'✓':'') + "</TD>";
	}
	divtext += "<TD STYLE='border:1px solid gray' COLSPAN=" + (lastct+1) + ">-</TD>";

	divtext+="</TR><TR><TD nowrap>Interpreted Bits</TD>";
	for( i = 0; i < KOBits.length; i++ )
	{
		divtext += "<TD STYLE='border:1px solid gray;"+(KOBits[i].length?(KOBits[i]=='1'?"background-color:yellow":"background-color:black;color:white"):"background-color:#cccccc") +"' COLSPAN=" + (KOBitLens[i]+1) + ">" + KOBits[i] + "</TD>";
	}
	divtext += "<TD STYLE='border:1px solid gray' COLSPAN=" + (lastct+1) + ">-</TD>";

	divtext+="</TR><TR><TD nowrap>On-wire Bytes</TD>";
	for( i = 0; i < Chars.length; i++ )
	{
		divtext += "<TD STYLE='border:1px solid gray' COLSPAN=" + (CharBitLens[i]) + " align=right>" + Chars[i] + "</TD>";
	}
	divtext += "<TD STYLE='border:1px solid gray' COLSPAN=" + (lastct+1) + ">-</TD>";


	divtext += "</TR></TABLE>";
	$("#LastPacketBody").html(divtext);





	//SO! That's how you decode manchester in Javascript, now let's do something faster.
	//We'll do this table-based thing and try to decode it all real-time.
	//Description of inputs and outputs of "Table1" can be found below.


	
	var Table1 = [];
	for( var i = 0; i < 1024; i++ )
	{
		//Outer algorithm
		var polarityin = (i>>9)&1; //1 bit
		var upperlast = (i>>8)&1;//1 bit
		var chi = (i>>5)&7;      //3 bits
		var inton = (i>>4)&1;    //1 bit
		var newbits = i & 15;    //4 bits


		var polarity = polarityin;  //1 bit.
		var cho = 0;			//3 bits
		var intonout = 0;		//1 bit
		var opout = 0;			//4 bits  upper-two: # of bits in output.  Bottom-2: actual bits.
		var wouldexitpreamble = false;

		if( chi == 7 )
		{
			cho = 7;
			invalid = true;
		}
		else
		{
			//The inner algorithm
			var bitct = chi;
			var lastbit = upperlast;
			var invalid = false;
			for( ib = 0; ib < 4; ib++ )
			{
				var bit = ((newbits>>(3-ib))&1 )?1:0;
				if( bit != lastbit )
				{
					//We have a bit change!

					bitct++;  //Make it actual bit count, since until now, bitct == 0 means we still have a bit.

					var is_long = false;

					//Not first change.
					if( lastbit )  //Was this 0 or 1?
					{
						//1? We should expect these to be less frequent, so 3-5 is long, 1-2 is short.
							 if( bitct <= 2 ) is_long = false;
						else if( bitct <= 5 ) is_long = true;
						else { invalid = true; break; }
					}
					else
					{
						//0? We should expect these to be more frequent, so 4-6 is a long.  2-3 is a short. 1 & 7 shold not be possible
							 if( bitct <= 1 ) { invalid = true; break; }
						else if( bitct <= 3 ) { is_long = false; }
						else if( bitct <= 6 ) { is_long = true; }
						else                  { invalid = true; break; }
					}

					var emit = false;
					var invert = false;

					if( is_long )
					{
						//Not allowed:  Can't have a short then a long.
						if( inton )
						{
							invalid = true;
							break;
						}

						emit = true;
						invert = true;
					}
					else
					{
						if( inton )
						{
							wouldexitpreamble = true;
							emit = true;
							invert = false;
							inton = false;
						}
						else
						{
							inton = true;
						}
					}

					if( emit )
					{
						if( (opout & 4) == 0 )
						{
							//If bit 0 is already taken, move on to bit 1

							if( invert ) polarity = !polarity;
							if( polarity ) opout |= 1;
							opout |= 4;
						}
						else
						{
							if( invert ) polarity = !polarity;
							if( polarity ) opout |= 2;
							opout |= 8;
							opout &= ~4;
						}
					}

					bitct = 0;
				}
				else
				{
					//Bits are the same.
					if( bitct == 6 )	//7 sequential bits are prohibted.
					{
						//We are overflowing!
						invalid = true;
						break;
					}
					else if( bitct != 7 ) //If bitct == 7, we can't do anything here.
					{
						bitct++;
					}
				}
				lastbit = bit;
			}
		}

		//Back to outer algorithm
		cho = invalid?7:bitct;
		intonout = inton;

		var upperlast = (newbits&1)?1:0;
		var code = cho<<5;
		code |= (intonout?1:0)<<4;
		code |= opout;
		code |= upperlast<<8;
		code |= polarity<<9;
		code |= (wouldexitpreamble)?(1<<10):0;

		Table1.push( code );
	}	


	divtext = "<PRE>";
	divtext += "\
//Inputs to our table 1:  1024x2 bytes\n\
//MSB\n\
// 1 Bit:  Last Polarity.\n\
// 1 Bit:  Upper bit of last nibble.\n\
// 3 Bits: # of bits in this chain 0..2 bits SPECIAL: 0x07 = Just starting  \"CHI\"\n\
// 1 Bit:  Intonation\n\
// 4 Bits: New bits!\n\
//LSB\n\
//\n\
//Outputs:\n\
//MSB\n\
// 1 Bit:  Would exit preamble if in preamble\n\
// 1 Bit:  New Polarity.\n\
// 1 Bit:  Upper bit of last nibble\n\
// 3 Bits: CHO -> Feed into \"CHI\"  If 0x07, Packet didn't begin, error occurred, or end of packet\n\
// 1 Bit:  Intonation Out -> Feed into \"INTON\"\n\
// 4 Bits: OCODE -> Output bits (actually like long + short, but only with matched intonation pairs)\n\
//   1 Bit = BIT 1\n\
//   1 Bit = BIT 0\n\
//   2 Bit = Nr of bits output.\n\
//LSB\n\
//NOTE: CHI/CHO is # of bits in chain.\n\n\
#ifndef ZERO_BIAS\n\
#error This table was created specifically for a bias-toward-zero system.\n\
#endif\n\
\n";
	divtext += "uint16_t ManchesterTable1[1024] = {";
	for( var i = 0; i < 1024; i++ )
	{
		if( (i & 15) == 0 ) divtext += "\n\t";
		divtext += "0x" + tohex12( Table1[i] ) + ", ";
	}
	divtext += "};\n\n";
	divtext += "</PRE>";
	$("#TablesText").html(divtext);


	//This is what the C code would look like.
	var DWORDS = [];
	for( i = 0; i < PacketHex.length; i++ )
	{
		var pk = PacketHex[i];
		var pkvbyte = parseInt( pk.substr(2), 16 );
		
		DWORDS.push( pkvbyte );
	}

	var state1or2 = [];
	var state1ins = [];
	var state1outs = [];
	var bytesoutplaces = [];
	var bytesoutsofar = 0;
	var bytesout = [];

	var bitoutdumps = [ "" ];
	var bitoutdumplens = [];
	var bitoutdumpsofar = 0;

	var state1 = 0;
	var state2 = 0;
	var currnib = 0;

	var in_preamble = true;
	var v = DWORDS[1];

	//Deal with the pre-preamble, we assume we're in a generic part of the preamble.
	var b0 = v&1; //Most recent bit.
	for( i = 1; i < 32; i++ )
	{
		if( ((v>>i)&1) != b0 ) break;
	}

	if( i > 6 )
	{
		//Faulty data.
		DWORDS = [0];
	}

	var nibble = 28;
	state1 = (1<<9) | ((v&1)<<8) | ( (i-1) << 5 );

	for( i = 0; i < 8; i++ )
	{
		state1ins.push( "" );
		state1outs.push( "" );  state1or2.push( 0 );
		bitoutdumpsofar++; bytesoutsofar++;
	}


	//Deal with the preamble
	for( i = 2; i < DWORDS.length; i++ )
	{
		var dword = DWORDS[i];
		if( in_preamble )
		{
			//Wait for preamble to complete.
			nibble = 28;
			for(  ; nibble >= 0; nibble-=4 )
			{
				currnib = (dword>>nibble)&0x0f;
				state1 |= currnib;
																			state1ins.push( tohex12( state1 ) );
				state1 = Table1[state1];
																			state1outs.push( tohex12( state1 ) );  state1or2.push( 1 );
																			bitoutdumpsofar++; bytesoutsofar++;
				if( (state1 & 0x400) ) { in_preamble = false;	nibble-=4; break; }	//Break in the preamble!
				state1 &= 0x3f0;
			}
		}
		if( !in_preamble )
		{
			break;
		}
	}


	state1 &= 0x3f0;

	// state1.10 = Set because we exited polarity.
	// state1.9 = Polarity
	// state1.8 = Upper Last (Don't care)
	// state1.5..7 = bits since?
	// state1.4 = Intonation
	// state1.0..3 = Bit outputs.

	//When we get here, we could have:
	// Gotten at least TWO shorts!
	// TODO: What if we got two shorts terminating the stream and a long (which is possible)

	//We would have a bit output that is the same polarity as "polarity."  I think? this is the only thing we need to watch out for?

	//Either way, when exiting polarity should be high (I think?)
	//We might have hit one or two shorts, but shouldn't be more... And, either way it goes, 

	//TODO: This is actually wrong!!!
	state1 |= 0x200; 

	var dataoutword = 0;
	var dataoutplace = 0;

	bytesoutplaces.push( bytesoutsofar ); bytesoutsofar = 0;
	bytesout.push( "" );


	for( ; i < DWORDS.length; i++ )
	{
		var dword = DWORDS[i];
		//Preamble complete, real packet.
		//Wait for preamble to complete.
		for( ; nibble >= 0; nibble-=4 )
		{
			currnib = (dword>>nibble)&0x0f;
			state1 |= currnib;
																		state1ins.push( tohex12( state1 ) );
			state1 = Table1[state1];
																		state1outs.push( tohex12( state1 ) ); state1or2.push( 2 );

			//This whole statement here is for debugging.
			if( state1 & 0x0c )
			{
				var thesebits = "";
				if( ( state1 & 0xc ) > 0 )
				{
					thesebits += (state1&1)?"1":"0";
				}
				if( (state1 & 0xc) > 0x04 )
				{
					thesebits += (state1&2)?"1":"0";
				}

				bitoutdumplens.push( bitoutdumpsofar );
				bitoutdumpsofar = 0;
				bitoutdumps.push( thesebits );
			}
																		bitoutdumpsofar++;bytesoutsofar++;

			//Hmm see if this can be optimized.
			dataoutword |= (state1&3)<<dataoutplace;
			dataoutplace += (state1>>2)&3;
			
			state1 &= 0x3f0;
		}

		//This code is stand-in you'll have to do something like this to pull the bytes out.
		var vdd = "";
		while( dataoutplace >= 8 )
		{
			vdd += tohex8( dataoutword & 0xff ) + " ";
			dataoutword >>= 8;
			dataoutplace -= 8;
		}

		if( vdd.length )
		{
			bytesoutplaces.push( bytesoutsofar ); bytesoutsofar = 0;
			bytesout.push( vdd );
		}

		nibble = 28;
	}



	divtext = "<TABLE STYLE='border:1px solid gray;border-collapse:collapse;background-color:#eeeeee'><TR><TD nowrap>Raw Hex</TD>";
	for( i = 0; i < PacketHex.length; i++ )
	{
		var pk = PacketHex[i];
		divtext += "<TD STYLE='border:1px solid gray;' COLSPAN=32>" + pk + " (" + i + ")</TD>";
	}

	divtext += "<TR><TD nowrap>Nibbles</TD>";
	for( i = 0; i < Packet.length/4; i++ )
	{
		var pk = Packet[i*4+0] * 8 + Packet[i*4+1] * 4 + Packet[i*4+2] * 2 + Packet[i*4+3];
		divtext += "<TD STYLE='border:1px solid gray' COLSPAN=4>" + pk.toString(16) + "<BR>" + 
			Packet[i*4+0] + "" + Packet[i*4+1] + "" + Packet[i*4+2] + "" + Packet[i*4+3] + "</TD>";
	}
	divtext += "</TR>";


	divtext += "<TR><TD nowrap>State 1 In<BR>Polarity<BR>Last bit<BR>CHI<BR>Inton<BR>New<BR><BR>State 1 Out<BR>Exit Preamble<BR>New Polarity<BR>Last<BR>Cho<BR>Inton<BR>OCODE</TD>";
	divtext += "<TD STYLE='border:1px solid gray;background-color:black' COLSPAN=32></TD>";
	for( i = 0; i < state1ins.length; i++ )
	{
		var st1i = parseInt( state1ins[i], 16 );
		var st1o = parseInt( state1outs[i], 16 );
		divtext += "<TD STYLE='border:1px solid gray;" + (( state1or2[i] == 1 )?"background-color:green":( (state1or2[i] == 0 )?"background-color:black":"")) + "' COLSPAN=4>" + state1ins[i] + "<BR>" + ((st1i>>9)&1) + "<BR>" + ((st1i>>8)&1) +
			"<BR>" + ((st1i>>5)&7) + "<BR>" + ((st1i>>4)&1) + "<BR>" + ((st1i)&15).toString(16) + "<BR><BR>" +
			state1outs[i] + "<BR>" + ((st1o>>10)&1) + "<BR>" + ((st1o>>9)&1) + "<BR>" + ((st1o>>8)&1) + "<BR>" +
			((st1o>>5)&7) + "<BR>" + ((st1o>>4)&1) + "<BR>" + (st1o&0x0f).toString(16) + "</TD>";
	}
	divtext += "</TR>";


	divtext += "<TR><TD nowrap>Bitouts</TD>";
	bitoutdumplens[0]+=8;
	divtext += "<TD STYLE='border:1px solid gray' COLSPAN=" + bitoutdumplens[0]*4 + "></TD>";
	for( i = 1; i < bitoutdumps.length; i++ )
	{
		divtext += "<TD STYLE='border:1px solid gray' COLSPAN=" + bitoutdumplens[i]*4 + ">" + bitoutdumps[i] + "</TD>";
	}
	divtext += "</TR>";


	divtext += "<TR><TD nowrap>Byteouts</TD>";
	divtext += "<TD STYLE='border:1px solid gray' COLSPAN=" + (bytesoutplaces[0]*4 + 32) + "></TD>";
	for( i = 1; i < bytesoutplaces.length; i++ )
	{
		divtext += "<TD STYLE='border:1px solid gray' COLSPAN=" + bytesoutplaces[i]*4 + " ALIGN=right>0x" + 
			bytesout[i] + "</TD>";
	}
	divtext += "</TR>";


	divtext += "</TABLE>";




	$("#LastPacketBody2").html(divtext);


}

function DownloadPacket( req, data )
{
	if( data[0] == '!' )
	{
		IssueSystemMessage( "Failed to download." ) ;
		return;
	}
	var vs = data.split( ":" );
	var Current = Number(vs[1]);
	var Size = Number(vs[2]);
	var Total = Number(vs[3]);
	var i = 0;

	$("#LastPacketBody").html($("#LastPacketBody").html() + "(" + PackPlace + "/" + Total + "/" + Current + " " + Size + " " + data + ")" );

	for( PackPlace; PackPlace < Total && i < Size; PackPlace++ )
	{
		var j = 0;
		var phex = "0x";
		for( j = 0; j < 8; j++ )
		{
			k = parseInt(vs[4][(j)+i*8], 16);
			Packet.push( (k & 8)?1:0 );
			Packet.push( (k & 4)?1:0 );
			Packet.push( (k & 2)?1:0 );
			Packet.push( (k & 1)?1:0 );

			kf = parseInt(vs[4][(j)+i*8], 16);
			phex += k.toString( 16 );
		}
		PacketHex.push( phex );
		//$("#LastPacketBody").html($("#LastPacketBody").html() + " [" + phex + "]" );
		i++;
	}

	//$("#LastPacketBody").html($("#LastPacketBody").html() + "<br>[" + PackPlace + "/" + Size + " " +  + "]" );


	if( PackPlace >= Total )
	{
		QueueOperation( "CN", DonePacket );	
		return;
	}


	Current += Size;
	QueueOperation( "CM:"+Current,  DownloadPacket );	

}

var waitingdots = 0;

function CheckPacketLockStatus( req, data )
{
	if( data[0] == '!' )
	{
		IssueSystemMessage( "Failed to request lock." ) ;
		return;
	}
	var vs = data.split( ":" );
	var i = Number(vs[1]);
	if( i <= 0 )
	{
		waitingdots++;
		$("#LastPacketBody").html("Waiting."+Array(waitingdots).join(".") );
		QueueOperation( "CL",  CheckPacketLockStatus );
		return;
	}
	$("#LastPacketBody").html("Downloading Packet..." );
	PackPlace = 0;
	Packet = [];
	PacketHex = [];
	QueueOperation( "CM:0",  DownloadPacket );
}

function GotPacketLock( req, data )
{
	if( data[0] == '!' )
	{
		IssueSystemMessage( "Failed to request lock." ) ;
		return;
	}
	$("#LastPacketBody").html("Waiting" ); waitingdots = 0;
	QueueOperation( "CL",  CheckPacketLockStatus );
}

function GotLED(req,data)
{
/*	var ls = document.getElementById('LEDCanvasHolder');
	var canvas = document.getElementById('LEDCanvas');
	var ctx = canvas.getContext('2d');
	var h = ls.height;
	var w = ls.width;
	if( canvas.width != ls.clientWidth-10 )   canvas.width = ls.clientWidth-10;
	if( ctx.canvas.width != canvas.clientWidth )   ctx.canvas.width = canvas.clientWidth;

	var secs = data.split( ":" );

	$( "#LEDPauseButton" ).css( "background-color", "green" );

	var samps = Number( secs[1] );
	var data = secs[2];
	var lastsamp = parseInt( data.substr(0,4),16 );
	ctx.clearRect( 0, 0, canvas.width, canvas.height );

	for( var i = 0; i < samps; i++ )
	{
		var x2 = i * canvas.clientWidth / samps;
		var samp = data.substr(i*6,6);
		var y2 = ( 1.-samp / 2047 ) * canvas.clientHeight;

		ctx.fillStyle = "#" + samp.substr( 2, 2 ) + samp.substr( 0, 2 ) + samp.substr( 4, 2 );
		ctx.lineWidth = 0;
		ctx.fillRect( x2, 0, canvas.clientWidth / samps+1, canvas.clientHeight );
	}

	var samp = parseInt( data.substr(i*2,2),16 );
*/
	LastPacketDataTicker();
} 

function LastPacketDataTicker()
{
/*	if( IsTabOpen('LEDs') )
	{
		is_leds_running = true;
		QueueOperation( "CL",  GotLED );
	}
	else
	{
		is_leds_running = 0;
	}
	$( "#LEDPauseButton" ).css( "background-color", (is_leds_running&&!pause_led)?"green":"red" );
*/
}

