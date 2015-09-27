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
the device as a PS2 mouse.  Note that switching into serio_raw mode will
prevent the device from acting as a cursor, so it's a good idea to have a
regular mouse plugged in.  

Once the device is in serio_raw mode, you can run the tester as:

    sudo node ps2_tester.js /dev/serio_raw0

where /dev/serio_raw0 is the serio_raw device attached to the ps2 device.

Help is available in the tool, simply type 'help' for a list of
available commands
