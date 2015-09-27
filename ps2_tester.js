#!/usr/bin/env node
/*
 * ps2_tester.js - PS/2 Touchpad configuration and debugging tool
 *
 * Copyright (C) 2015 Jason Kuri
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *****************************************************************************
 **                                                                         **
 **  PS/2 touchpad test program, designed to allow debugging and testing    **
 **  of ps/2 based trackpads, originally built to test configs for the      **
 **  BYD electronics pad BTP10463-212 in Purism's Librem family of laptops. **
 **                                                                         **
 *****************************************************************************
 *
 */

var fs = require("fs");
var readline = require("readline");
var util = require("util");
var fd, dev, write_dev;
var debug_mode = false;
var in_data = [];
var last_send = Date.now(),
    last_received = Date.now() + 1;



var device_file = process.argv[2];
if (typeof device_file == "undefined") {
    console.log("Usage: " + process.argv[1] + " device_file");
    process.exit(2);
}

function debug(str) {
    if (debug_mode) {
        console.log(str);
    }
}

function send_bytes(bytes, cb) {
    var buf = make_buffer(bytes);

    var f = fs.write(fd, buf, 0, buf.length, function(err, written, string) {
        debug("TO_PAD: " + bytes_to_strings(bytes, 16, 2).join(" "));
        if (typeof cb == 'function') {
            cb();
        }
    });
}

var commands = {
    "init_ps2": {
        "description": "Resets touchpad to defaults",
        "send": ["reset", "set_defaults"],
        "expect": []
    },
    "init_im": {
        "description": "Resets touchpad and initializes to Intellimouse mode",
        "send": [
            "init_ps2",
            ["set_sample_rate", 0xC8],
            ["set_sample_rate", 0x64],
            ["set_sample_rate", 0x50],
            "get_device_id"
        ],
        "expect": []
    },
    "init_im5": {
        "description": "Resets touchpad and initializes to Intellimouse 5-button mode",
        "send": [
            "init_im",
            ["set_sample_rate", 0xC8],
            ["set_sample_rate", 0xC8],
            ["set_sample_rate", 0x50],
            "get_device_id"
        ],
        "expect": [0xFA, 0x04]
    },
    "byd_detect": {
        "description": "Initializes BYD touchpad and sends detect sequence. Only works once.",
        "send": [
            "init_im",
            ["set_resolution", 0x03],
            ["set_resolution", 0x03],
            ["set_resolution", 0x03],
            ["set_resolution", 0x03],
            "get_status"
        ],
        expect: []
    },
    "byd_default_config": {
        "description": "Sets BYD touchpad to default configuration",
        "send": [
            ["byd_tapping", 0x02],
            ["byd_edge_scrolling", 0x04],
            ["byd_button_disable", 0x00],
            ["byd_button_control", 0x04],
            ["byd_handedness", 0x01],
            ["byd_edge_motion", 0x01],
            ["byd_touch_sensitivity", 0x04],
            ["byd_two_finger_scroll", 0x03],
            ["byd_two_finger_options", 0x01],
            ["byd_gestures_enabled", 0x01]
        ],
        expect: []
    },
    // base ps/2 commands start
    "reset": {
        "description": "Resets touchpad",
        "send": [0xFF],
        "expect": [0xFA, 0xAA, 0x00]
    },
    "resend": {
        "description": "Asks touchpad to resend last data",
        "send": [0xFE],
        "expect": [0xFA]
    },
    "error": {
        "description": "Tells touchpad there was an error (The touchpad's response is undefined)",
        "send": [0xFC],
        "expect": [0xFE]
    },
    "set_defaults": {
        "description": "Sets touchpad to default settings (touchpad dependent)",
        "send": [0xf6],
        "expect": [0xFA]
    },
    "stop_reporting": {
        "description": "Stop reporting movement data",
        "send": [0xF5],
        "expect": [0xFA]
    },
    "start_reporting": {
        "description": "Start reporting movement data (only valid in streaming mode)",
        "send": [0xF4],
        "expect": [0xFA]
    },
    "set_sample_rate": {
        "description": "Set touchpad sampling rate",
        "send": [0xF3],
        "expect": [0xFA, 0xFA]
    },
    "get_device_id": {
        "description": "Get touchpad's device id",
        "send": [ 0xf2 ],
        "expect": [0xFA, "*"]
    },
    "set_remote_mode": {
        "description": "Set touchpad to polling mode (read data using read_data command)",
        "send": [0xF0],
        "expect": [0xFA]
    },
    "set_wrap_mode": {
        "description": "Set touchpad to echo back all commands sent to it. (reset clears)",
        "send": [0xEE],
        "expect": [0xFA]
    },
    "reset_wrap_mode": {
        "description": "Resets counters and return to previous mode",
        "send": [0xEC],
        "expect": [0xFA]
    },
    "read_data": {
        "description": "Reads touchpad cursor position (only valid in remote mode)",
        "send": [0xEB],
        "expect": [0xFA, "*", "*", "*", "*"]
    },
    "set_stream_mode": {
        "description": "Places touchpad in stream mode (use start_reporting to begin)",
        "send": [0xEA],
        "expect": [0xFA]
    },
    "get_status": {
        "description": "Get current touchpad base settings (mode, resolution, sample_rate)",
        "send": [0xE9],
        "expect": [0xFA, "*", "*", "*"]
    },
    "set_resolution": {
        "description": "Set touchpad resolution",
        "args": { "0": "1 count/mm", "1": "2 counts/mm", "2": "4 counts/mm", "3": "8 counts/mm" },
        "send": [0xE8],
        "expect": [0xFA, 0xFA]
    },
    "set_scaling_double": {
        "description": "Enable double scaling mode",
        "send": [0xE8],
        "expect": [0xFA]
    },
    "set_scaling_normal": {
        "description": "Set scaling mode to normal",
        "send": [0xE7],
        "expect": [0xFA]
    },
    "byd_button_disable": {
        "description": "Enable or disable click-button",
        "args": { "0" : "normal", '8': "disabled"},
        "send": [0xd0], // arg: 0 = normal, 8 = disabled
        "expect": [0xFA, 0xFA]
    },
    "byd_tapping": {
        "description": "Enable or disable tapping",
        "args": { "1": "on", "2": "off"},
        "send": [0xd4], // arg: 1 = on, 2 = off
        "expect": [0xFA, 0xFA]
    },
    "byd_handedness": {
        "description": "Set right or left handedness",
        "args": { "1": "Right Handed", "2": "left handed"}, // arg: 1 = right handed, 2 = left handed
        "send": [0xd3],
        "expect": [0xFA, 0xFA]
    },
    "byd_tapdrag": {
        "description": "Configure tap & drag",
        "args": { "1": "Drag", "2": "Drag Lock", "3": "Disabled"},
        "send": [0xd5], // arg: 1 = drag, 2 = drag lock, 3 = disabled
        "expect": [0xFA, 0xFA]
    },
    "byd_edge_scrolling": {
        "description": "Configure edge-scrolling",
        "args": { "1": "Vertical", "2": "Horizontal", "3": "Both", "4": "None"},
        "send": [0xd7], // arg: 1 = vertical, 2 = horizontal, 3 = vertical+horizontal, 4 = off
        "expect": [0xFA, 0xFA]
    },
    "byd_edge_scroll_config": {
        "description": "Edge-motion during edge-scroll",
        "args": { "1": "Free Scrolling", "2": "Edge Motion", "3": "Both", "4": "None"},
        "send": [0xd8], // arg: 1 = both directions, 2= continue scrolling at edge, 3 = both, 4 = disabled
        "expect": [0xFA, 0xFA]
    },
    "byd_slide_speed": {
        "description": "Set slide speed",
        "args": { "1": "Slowest", "5": "Fastest"},
        "send": [0xda], // arg: 1 = slow -> 5 = fast
        "expect": [0xFA, 0xFA]
    },
    "byd_edge_motion": {
        "description": "Configure edge-motion",
        "send": [0xdb], // arg: 1 = off, 2 = when dragging, 3 = dragging and pointing
        "args": { "1": "Off", "2": "When Dragging", "3": "Dragging and Pointing"},
        "expect": [0xFA, 0xFA]
    },
    "byd_edge_motion_speed": {
        "description": "Configure Edge-motion speed",
        "args": { "0": "Pressure Controlled", "1": "Slowest", "9": "Fastest"},
        "send": [0xe4], // arg: 0 = pressure_controlled, 1->9 slow->fast = on,
        "expect": [0xFA, 0xFA]
    },
    "byd_touch_sensitivity": {
        "description": "Set touchpad sensitivity",
        "args": { "1": "Lowest", "7": "Highest"},
        "send": [0xd6], // arg: 1=low, 7 = high,
        "expect": [0xFA, 0xFA]
    },
    "byd_palm_check": {
        "description": "Set palm-detection sensitivity",
        "args": { "1": "Lowest", "6": "Highest"},
        "send": [0xde], // arg: 1 = low, 6 = high
        "expect": [0xFA, 0xFA]
    },
    "byd_gestures_enabled": {
        "description": "Enable gesture detection",
        "send": [0xe3], // arg: 1 = on, 2 = off
        "args": { "1": "On", "2": "Off"},
        "expect": [0xFA, 0xFA]
    },
    "byd_tapdrag_delay": {
        "description": "Set tap & drag delay",
        "send": [0xcf], // arg: 0 = off, 1 = shortest, 8 = longest
        "args": { "0": "Off", "1": "Shortest", "8": "Longest"},
        "expect": [0xFA, 0xFA]
    },
    "byd_two_finger_scroll": {
        "description": "Enable two-finger scrolling gesture",
        "args": { "1": "Vertical", "2": "Horizontal", "3": "Both", "4": "Off"},
        "send": [0xd2], // arg: 1 = vertical, 2 = horizontal, 3 = both, 4 = off
        "expect": [0xFA, 0xFA]
    },
    "byd_two_finger_options": {
        "description": "Configure two-finger scrolling options",
        "args": { "1": "Free", "2": "Edge Motion On", "3": "Both", "4": "Off"},
        "send": [0xe5], // arg: 1 = free, 2 = edge_motion_on, 3 = both, 4 = off
        "expect": [0xFA, 0xFA]
    },
    "byd_left_edge_width": {
        "description": "Set Left-edge width",
        "args": { "0": "None", "1": "Thinnest", "7": "Widest"},
        "send": [0xdc], // arg: 0 = thin, 7 = wide
        "expect": [0xFA, 0xFA]
    },
    "byd_top_edge_height": {
        "description": "Set Top-edge height",
        "args": { "0": "None", "1": "Shortest", "7": "Tallest"},
        "send": [0xdd], // arg: 0 = short, 7 = tall
        "expect": [0xFA, 0xFA]
    },
    "byd_right_edge_width": {
        "description": "Set Right-edge width",
        "args": { "0": "None", "1": "Thinnest", "7": "Widest"},
        "send": [0xdf], // arg: 0 = thin, 7 = wide
        "expect": [0xFA, 0xFA]
    },
    "byd_bottom_edge_height": {
        "description": "Set bottom-edge height",
        "args": { "0": "None", "1": "Shortest", "7": "Tallest"},
        "send": [0xe1], // arg: 0 = short, 7 = tall
        "expect": [0xFA, 0xFA]
    },
    "byd_report_abs_pos": {
        "description": "Enable absolute position reporting",
        "args": { "0": "Off", "2": "On"},
        "send": [0xd1], // arg: 0 = off, 2 = on
        "expect": [0xFA, 0xFA]
    },
    "byd_button_control": {
        "description": "Control how touchpad button is interpreted",
        "args": { "4": "Normal", "5": "Left as gesture", "6": "Right as gesture", "7": "Both as Gesture"},
        "send": [0xd0], // 4 == normal, 5 = left-as-gesture, 6 = right-as-gesture, 7 = both-corners-as-gesture
        "expect": [0xFA, 0xFA]
    },
    "raw": {
        "description": "Send a hex byte directly to pad",
        "send": [],
        "expect": [ "*" ]
    }
};

var gestures = [
    {
        "code": 0x28,
        gesture: "pinch out"
    },
    {
        "code": 0x29,
        gesture: "rotate clockwise"
    },
    {
        "code": 0x2a,
        gesture: "scroll right (two finger)"
    },
    {
        "code": 0x2b,
        gesture: "scroll down (two finger)"
    },
    {
        "code": 0x2c,
        gesture: "three-finger swipe-right"
    },
    {
        "code": 0x2d,
        gesture: "three-finger swipe-down"
    },
    {
        "code": 0x2e,
        gesture: "left-click"
    },
    {
        "code": 0x33,
        gesture: "four finger swipe-down"
    },
    {
        "code": 0x35,
        gesture: "scroll right (region)"
    }, // haven't seen this yet
    {
        "code": 0x36,
        gesture: "scroll down (region)"
    }, // haven't seen this yet
    {
        "code": 0xd3,
        gesture: "three-finger swipe-up"
    },
    {
        "code": 0xd4,
        gesture: "three-finger swipe-left"
    },
    {
        "code": 0xd5,
        gesture: "scroll up (two finger)"
    },
    {
        "code": 0xd6,
        gesture: "scroll left (two finger)"
    },
    {
        "code": 0xd7,
        gesture: "rotate counter-clockwise"
    },
    {
        "code": 0xd8,
        gesture: "pinch in"
    },
    {
        "code": 0xca,
        gesture: "scroll up (region)"
    }, // haven't seen this yet
    {
        "code": 0xcb,
        gesture: "scroll left (region)"
    }, // haven't seen this yet
    {
        "code": 0xcd,
        gesture: "four finger swipe-up"
    },
    {
        "code": 0xd2,
        gesture: "right-click"
    },
];


function autocomplete_command(line) {
    var words = line.split(/\s+/);
    var matching = words[0];
    var help;
    if (words[0] == "help") {
        words.shift();
        matching += " " + words[0];
    }
    var hits = Object.keys(commands).filter(function(c) {
        return c.indexOf(words[0]) == 0
    });
    if (hits.length == 1 && words[0] == hits[0] && typeof commands[hits[0]] != 'undefined') {
        help = help_for_command(hits[0]);
        if (help.args) {
            console.log("\n   " + new Array(hits[0].length).join(' ') + help.args);
        }
    }
    return [hits, matching];
}

function resolve_command(command_name, args) {
    var command_list = [], new_args;
    if (typeof commands[command_name] == 'undefined') {
        throw new Error('Unable to resolve command: ' + command_name);
    }
    // { send: expect: }
    var cmd = {
        "command_name": command_name,
        "command": commands[command_name],
        "to_send": [],
        "expect": [].concat(commands[command_name].expect),
        "received": []
    };

    cmd.command.send.forEach(function(item) {
        var res, new_cmd, args;
        if (typeof item == 'number') {
            cmd.to_send.push(item);

        } else {
            if (Array.isArray(item)) {
                args = [].concat(item);
                new_cmd = args.shift();
            } else {
                new_cmd = item;
            }
            res = resolve_command(new_cmd, args);
            cmd.to_send.push(res);
        }
    });
    if (typeof args != 'undefined') {
        cmd.to_send = cmd.to_send.concat(args);
    }
    return cmd;
}

var command_stack = {
    root: undefined,
    parent: undefined,
    current_cmd: undefined
};

function handle_command(command_name, args) {
    try {
        command_stack.root = resolve_command(command_name, args);
        command_stack.current_cmd = command_stack.root;
        command_stack.parent = [];
        next_cmd_step();
    } catch (e) {
        console.error("Can't process '" + command_name + "': " + e.toString());
        console.error(e.stack);
        return;
    }
}

function next_cmd_step() {
    var current = command_stack.current_cmd;
    if (typeof current == 'undefined') {
        return;
    }
    var next_bit;
    debug('next command step: ' + util.inspect(current, {depth:null}));
    if (current.expect.length == 0 && current.to_send.length == 0) {
        finished_command();
    } else {
        if (last_send < last_received) {
            // we have something to send.  What is it?
            next_bit = current.to_send.shift();
            if (typeof next_bit == 'number') {
                if(current.received.length == 0) {
                    console.log("sending command: " + current.command_name + ": " + bytes_to_strings(current.to_send, 16, 2));
                }
                debug('Sending Byte:' + next_bit);
                last_send = Date.now();
                send_bytes([next_bit], function() {
                    if (current.to_send.length) {
                        next_cmd_step();
                    }
                });
            } else {
                // we have another command to send.  Let's queue it up.
                debug('descendign into next item: ' + util.inspect(next_bit));
                command_stack.parent.push(current);
                command_stack.current_cmd = next_bit;
                next_cmd_step();
            }
        } else {
            debug('waiting for reply from pad');
            setTimeout(function() {
                next_cmd_step();
            }, 250);
        }
    }
}

function finished_command(bytes) {
    // if we are finished, we pop the parent off the stack.
    var last = command_stack.current_cmd;
    console.log("Command " + last.command_name + " finished: " + bytes_to_strings(last.received, 16, 2));
    command_stack.current_cmd = command_stack.parent.pop();
    next_cmd_step();
}


function new_data_received() {
    var data, recvd_byte, failed_match = false;
    debug('in_data: ' + bytes_to_strings(in_data, 16, 2));
    var current = command_stack.current_cmd;
    last_received = Date.now();
    // If we have data, and we have a command
    if (typeof current != 'undefined') {
        failed_match = false;
        while (in_data.length > 0 && current.expect.length > 0 && failed_match == false) {
            if (current.expect[0] == in_data[0] || current.expect[0] == '*') {
                current.expect.shift();
                recvd_byte = in_data.shift();
                current.received.push(recvd_byte);
            } else {
                failed_match = true;
            }
        }
        // if we are here, we either ran out of data to match, or we failed the match.
        if (failed_match) {
            console.error('Failed response match, wanted: ' + zero_pad(current.expect[0], 16, 2) + ' got: ' + zero_pad(in_data[0], 16, 2));
            return abort_command();
        }
        // if we are here, we either matched entirely, or ran out of data.
        if (current.expect.length == 0) {
            finished_command();
            if (in_data.length != 0) {
                setTimeout(function() {
                    new_data_received();
                }, 0);
            }
            return;
        } else {
            // we ran out of in_data... so we wait for more.
            return;
        }
    } else if (in_data.length != 0) {
        if (in_data.length >= 1) {
            if (in_data[0] & 0x08 != 0x08) {

                console.log('stream out of sync: ' + util.inspect(in_data));
                flush_input();
            } else {
                if (in_data.length >= 4) {
                    data = in_data.splice(0, 4);
                    console.log(util.inspect(decode_ps2(data)));
                }
            }
        }
    }
}


function display_data(data, prefix) {
    if (typeof prefix == 'undefined') {
        prefix = '';
    }
    if (data.length) {
        data.forEach(function(item, index) {
            console.log("%s%d: %s %s", prefix, index, zero_pad(item, 16, 2), zero_pad(item, 2, 8));
        });
        console.log(" ");
    }
}

function decode_ps2(bytes) {
    var packet = {
        buttons: {},
        time: Date.now()
    };
    var key, match;
    if (0x08 & bytes[0] != 0x08) {
        console.warn("bit 4 of first byte is not set, this isn't a PS/2 packet");
        display_data(bytes);
        return;
    }
    packet.buttons.left = 0x01 & bytes[0];
    packet.buttons.right = 0x02 & bytes[0];
    packet.buttons.middle = 0x04 & bytes[0];

    if (bytes[3]) {
        match = false;
        for (var i = 0; i < gestures.length; i++) {
            if (bytes[3] == gestures[i].code) {
                packet.gesture = gestures[i].gesture;
                match = true;
            }
        }
        if (!match) {
            packet.gesture = "unknown_" + zero_pad(bytes[3], 16, 2);
        }
        packet.x_position = bytes[1];
        packet.y_position = bytes[2];

    } else {
        packet.y_overflow = 0x80 & bytes[0];
        packet.x_overflow = 0x40 & bytes[0];

        packet.x_movement = bytes[1];
        packet.y_movement = bytes[2];
        if (0x10 & bytes[0]) {
            packet.x_movement = 0 - (0x100 - packet.x_movement);
        }
        if (0x20 & bytes[0]) {
            packet.y_movement = 0 - (0x100 - packet.y_movement);
        }
        if (bytes.length == 4) {
            // intellimouse extensions
            packet.z_movement = 0x07 & bytes[3];
            if (0x08 & bytes[3]) {
                packet.z_movement = 0 - (0x08 - packet.z_movement);
            }
            packet.buttons.fourth = 0x10 & bytes[3];
            packet.buttons.fifth = 0x20 & bytes[3];
            packet.gestures = 0xf8 & bytes[3];
        }
    }
    return packet;
}

function zero_pad(byte, radix, len) {
    var str = byte.toString(radix);
    var need_zeros = len - str.length;
    if (need_zeros < 0) { need_zeros = 0 };
    return (new Array(1 + need_zeros).join("0")) + str;
}

function bytes_to_strings(bytes, radix, len) {
    var strings = []
    bytes.forEach(function(byte) {
        strings.push(zero_pad(byte, radix, len));
    });
    return strings;
}

function make_buffer(arr) {
    var b = new Buffer(arr.length);
    arr.forEach(function(item, index) {
        b.writeUInt8(item, index);
    })
    return b;
}

function flush_input() {
    console.log("Flushing input queue");
    // in_data is our inbound data buffer.
    in_data = [];
};

function abort_command() {
    if (typeof command_stack.current_cmd != 'undefined') {
        console.log('Command ' + command_stack.current_cmd.command_name + ' aborted!');
        command_stack = [];
        console.log('A reset may be required to restore pad to working order');
    } else {
        console.log('No command to abort.');
    }
    flush_input();
}

function help_for_command(cmd) {
    var message = { command: cmd };
    var str;
    if (typeof commands[cmd] !== 'undefined') {
        if (typeof commands[cmd].description !== 'undefined') {
            message.description = commands[cmd].description;
        }
        if(typeof commands[cmd].args !== 'undefined') {
            str = "("
            var keys = Object.keys(commands[cmd].args);
            keys.forEach(function(key) {
                str += key + "=" + commands[cmd].args[key] + ' ';
            });
            str += ")"
            message.args = str;
        }
        return message;
    } else {
        return undefined;
    }
}

fs.open(device_file, "r+", function(err, file_desc) {
    if (err) {
        throw err;
    } else {
        fd = file_desc;
        dev = fs.createReadStream("ignored", {
            "fd": fd
        });

        dev.on("data", function(chunk) {
            var bytes = [];
            var byte;
            for (var i = 0; i < chunk.length; i++) {
                byte = chunk.readUInt8(i);
                bytes.push(byte);
                in_data.push(byte);
            }

            setTimeout(new_data_received, 0);
        });
    }
});

var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: autocomplete_command
});

rl.setPrompt(">");
rl.on("line", function(line) {
    var bytes, words, fail, command, things, help;
    words = line.split(/\s+/);
    command = words.shift();
    if (command == "") {
        rl.prompt();
    } else if (/abort/i.test(command)) {
        abort_command();
    } else if (/flush/i.test(command)) {
        flush_input();
    } else if (/debug/i.test(command)) {
        debug_mode = !debug_mode;
        console.log('Debug set to ' + debug_mode);
    } else if (/show_data/i.test(command)) {
        console.log('in_data: ' + bytes_to_strings(in_data, 16, 2));
    } else if (/^help/i.test(command)) {
        things = Object.keys(commands);
        if (words.length != 0) {
            console.log('Usage: ');
            things = words;
        } else {
            console.log("Command Help:\n");
            console.log('    help - This help');
            console.log('    flush - clear input buffer');
            console.log('    debug - toggle debug logging');
            console.log('    show_data - show current input buffer');
        }
        things.forEach(function(cmd) {
            var help = help_for_command(cmd);
            var message = "    " + help.command;
            if (help.description) {
                message += " - " + help.description + "\n";
            }
            if (help.args) {
                message += "        " + help.args + "\n";
            }
            console.log(message);
        });
        console.log("");
        rl.prompt();
    } else {
        fail = false;
        if (command.length == 2 && !isNaN(parseInt(command, 16))) {
            words.unshift(command);
            command = 'raw';
        }
        bytes = [];
        words.forEach(function(item) {
            var b = parseInt(item, 16);
            if (isNaN(b)) {
                console.log("Cant parse %s", item);
                fail = true;
            } else {
                bytes.push(b);
            }
        });
        if (!fail) {
            handle_command(command, bytes);
        }
    }
});
rl.prompt();
