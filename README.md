ps2_tester.js
=============

ps2_tester.js is a PS/2 Touchpad configuration and debugging tool written by
Jay Kuri (@JayKuri)

This program is designed to allow debugging and testing of ps/2 based
trackpads, originally built to test configs for the BYD electronics
pad BTP10463-212 in Purism's Librem family of laptops.

Usage
-----

This program requires node.js - Any node.js after 0.11 should work.
In order to use this command, you must switch the mouse into serio_raw mode.
You can do this by running the `enable_ps2_serio_raw.sh` command with an
argument of 1. Running the command again with an argument of 0 will restore
the device as a PS2 mouse.  Running the command repeatedly will increment
the serio_raw# device number, so you may have to `ls /dev/serio_raw*` to
find the device that was created. Note that switching into serio_raw mode will
prevent the device from acting as a cursor, so it's a good idea to have a
regular mouse plugged in.  

Once the device is in serio_raw mode, you can run the tester as:

    sudo node ps2_tester.js /dev/serio_raw0

where /dev/serio_raw0 is the serio_raw device attached to the ps2 device.

Help is available in the tool, simply type 'help' for a list of
available commands.

Debugging sessions
------------------

Generally you want to begin a debugging session with a `reset`.  Once
the device is reset, you want to run either `init_ps2` or `init_im`
depending on your device.

Your device may require special startup commands or a particular sequence
of commands in order to correctly start up.  You can issue individual bytes
to the hardware by simply entering `raw ` followed by the byte value you want
to send in hex.  IE `raw e9` would manually send the ps2 'get status' command.
If your device responds with additional bytes of information, you can see
them with the `show_data` command.  If this is the case, be sure to flush
the input buffer using the `flush` command before running other commands as
data left in the input buffer will confuse the command response processor.

If you need to see a bit more detail than is normally shown, you can use
the `debug` command to toggle printing of the raw data going to and from
the device, as well as other useful debugging information.

This script is meant to be hacked on and adjusted to your needs. Specific
decoding of data from touchpads is often vendor specific, so don't be afraid
to adjust the decoding routines.

Happy Hacking!

Jay Kuri
