{
    "patcher": {
        "fileversion": 1,
        "appversion": {
            "major": 9,
            "minor": 1,
            "revision": 2,
            "architecture": "x64",
            "modernui": 1
        },
        "classnamespace": "box",
        "rect": [ 100.0, 100.0, 900.0, 750.0 ],
        "boxes": [
            {
                "box": {
                    "id": "title_comment",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 10.0, 500.0, 20.0 ],
                    "text": "=== LOOP BUS: #1 — double-buffered crossfade loop playback ==="
                }
            },
            {
                "box": {
                    "comment": "Bus volume float 0-1 from fold-mapping",
                    "id": "vol_inlet",
                    "index": 1,
                    "maxclass": "inlet",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 20.0, 50.0, 30.0, 30.0 ]
                }
            },
            {
                "box": {
                    "id": "vol_pack",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 20.0, 90.0, 70.0, 22.0 ],
                    "text": "pack f 20"
                }
            },
            {
                "box": {
                    "id": "vol_line",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 2,
                    "outlettype": [ "signal", "bang" ],
                    "patching_rect": [ 20.0, 120.0, 55.0, 22.0 ],
                    "text": "line~ 0."
                }
            },
            {
                "box": {
                    "id": "buffer_obj",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "float", "bang" ],
                    "patching_rect": [ 600.0, 50.0, 150.0, 22.0 ],
                    "text": "buffer~ loop_#1"
                }
            },
            {
                "box": {
                    "id": "buf_loadmess",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 600.0, 80.0, 270.0, 22.0 ],
                    "text": "loadmess replace samples/ambience/#1.wav"
                }
            },
            {
                "box": {
                    "id": "info_obj",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 11,
                    "outlettype": [ "float", "list", "float", "float", "float", "float", "float", "float", "", "int", "" ],
                    "patching_rect": [ 600.0, 130.0, 130.0, 22.0 ],
                    "text": "info~ loop_#1"
                }
            },
            {
                "box": {
                    "id": "send_buflen",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 600.0, 160.0, 130.0, 22.0 ],
                    "text": "s geosoni_buflen"
                }
            },
            {
                "box": {
                    "id": "recv_go",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 150.0, 170.0, 140.0, 22.0 ],
                    "text": "r geosoni_loop_go"
                }
            },
            {
                "box": {
                    "id": "msg_start",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 150.0, 200.0, 85.0, 22.0 ],
                    "text": "start_playing"
                }
            },
            {
                "box": {
                    "id": "recv_xfade",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 280.0, 170.0, 120.0, 22.0 ],
                    "text": "r geosoni_xfade"
                }
            },
            {
                "box": {
                    "id": "msg_xfade",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 280.0, 200.0, 45.0, 22.0 ],
                    "text": "xfade"
                }
            },
            {
                "box": {
                    "id": "recv_stop",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 420.0, 170.0, 140.0, 22.0 ],
                    "text": "r geosoni_loop_stop"
                }
            },
            {
                "box": {
                    "id": "msg_stop",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 420.0, 200.0, 38.0, 22.0 ],
                    "text": "stop"
                }
            },
            {
                "box": {
                    "id": "js_voice",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 6,
                    "outlettype": [ "", "", "", "", "", "" ],
                    "patching_rect": [ 150.0, 240.0, 400.0, 22.0 ],
                    "text": "js loop_voice.js"
                }
            },
            {
                "box": {
                    "id": "groove_a",
                    "maxclass": "newobj",
                    "numinlets": 3,
                    "numoutlets": 3,
                    "outlettype": [ "signal", "signal", "signal" ],
                    "patching_rect": [ 50.0, 340.0, 150.0, 22.0 ],
                    "text": "groove~ loop_#1 2"
                }
            },
            {
                "box": {
                    "id": "groove_a_loopoff",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 50.0, 310.0, 90.0, 22.0 ],
                    "text": "loadmess loop 0"
                }
            },
            {
                "box": {
                    "id": "groove_b",
                    "maxclass": "newobj",
                    "numinlets": 3,
                    "numoutlets": 3,
                    "outlettype": [ "signal", "signal", "signal" ],
                    "patching_rect": [ 400.0, 340.0, 150.0, 22.0 ],
                    "text": "groove~ loop_#1 2"
                }
            },
            {
                "box": {
                    "id": "groove_b_loopoff",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 400.0, 310.0, 90.0, 22.0 ],
                    "text": "loadmess loop 0"
                }
            },
            {
                "box": {
                    "id": "fade_line_a",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 2,
                    "outlettype": [ "signal", "bang" ],
                    "patching_rect": [ 220.0, 380.0, 55.0, 22.0 ],
                    "text": "line~ 0."
                }
            },
            {
                "box": {
                    "id": "fade_line_b",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 2,
                    "outlettype": [ "signal", "bang" ],
                    "patching_rect": [ 570.0, 380.0, 55.0, 22.0 ],
                    "text": "line~ 0."
                }
            },
            {
                "box": {
                    "id": "mul_fade_a_L",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "signal" ],
                    "patching_rect": [ 50.0, 420.0, 40.0, 22.0 ],
                    "text": "*~"
                }
            },
            {
                "box": {
                    "id": "mul_fade_a_R",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "signal" ],
                    "patching_rect": [ 130.0, 420.0, 40.0, 22.0 ],
                    "text": "*~"
                }
            },
            {
                "box": {
                    "id": "mul_fade_b_L",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "signal" ],
                    "patching_rect": [ 400.0, 420.0, 40.0, 22.0 ],
                    "text": "*~"
                }
            },
            {
                "box": {
                    "id": "mul_fade_b_R",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "signal" ],
                    "patching_rect": [ 480.0, 420.0, 40.0, 22.0 ],
                    "text": "*~"
                }
            },
            {
                "box": {
                    "id": "sum_L",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "signal" ],
                    "patching_rect": [ 50.0, 470.0, 370.0, 22.0 ],
                    "text": "+~"
                }
            },
            {
                "box": {
                    "id": "sum_R",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "signal" ],
                    "patching_rect": [ 130.0, 500.0, 370.0, 22.0 ],
                    "text": "+~"
                }
            },
            {
                "box": {
                    "id": "mul_vol_L",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "signal" ],
                    "patching_rect": [ 50.0, 540.0, 40.0, 22.0 ],
                    "text": "*~"
                }
            },
            {
                "box": {
                    "id": "mul_vol_R",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "signal" ],
                    "patching_rect": [ 130.0, 540.0, 40.0, 22.0 ],
                    "text": "*~"
                }
            },
            {
                "box": {
                    "comment": "Left channel audio output",
                    "id": "out_L",
                    "index": 1,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 50.0, 590.0, 30.0, 30.0 ]
                }
            },
            {
                "box": {
                    "comment": "Right channel audio output",
                    "id": "out_R",
                    "index": 2,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 130.0, 590.0, 30.0, 30.0 ]
                }
            },
            {
                "box": {
                    "id": "sig_speed_a",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "signal" ],
                    "patching_rect": [ 50.0, 290.0, 45.0, 22.0 ],
                    "text": "sig~ 0."
                }
            },
            {
                "box": {
                    "id": "sig_speed_b",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "signal" ],
                    "patching_rect": [ 400.0, 290.0, 45.0, 22.0 ],
                    "text": "sig~ 0."
                }
            }
        ],
        "lines": [
            {
                "patchline": {
                    "source": [ "vol_inlet", 0 ],
                    "destination": [ "vol_pack", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "vol_pack", 0 ],
                    "destination": [ "vol_line", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "buf_loadmess", 0 ],
                    "destination": [ "buffer_obj", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "buffer_obj", 1 ],
                    "destination": [ "info_obj", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "info_obj", 6 ],
                    "destination": [ "send_buflen", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "recv_go", 0 ],
                    "destination": [ "msg_start", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "msg_start", 0 ],
                    "destination": [ "js_voice", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "recv_xfade", 0 ],
                    "destination": [ "msg_xfade", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "msg_xfade", 0 ],
                    "destination": [ "js_voice", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "recv_stop", 0 ],
                    "destination": [ "msg_stop", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "msg_stop", 0 ],
                    "destination": [ "js_voice", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "groove_a_loopoff", 0 ],
                    "destination": [ "groove_a", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "groove_b_loopoff", 0 ],
                    "destination": [ "groove_b", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "js_voice", 0 ],
                    "destination": [ "sig_speed_a", 0 ],
                    "midpoints": [ 159.5, 270.0, 59.5, 270.0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "js_voice", 1 ],
                    "destination": [ "groove_a", 1 ],
                    "midpoints": [ 229.5, 270.0, 125.0, 270.0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "js_voice", 2 ],
                    "destination": [ "sig_speed_b", 0 ],
                    "midpoints": [ 299.5, 270.0, 409.5, 270.0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "js_voice", 3 ],
                    "destination": [ "groove_b", 1 ],
                    "midpoints": [ 369.5, 270.0, 475.0, 270.0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "js_voice", 4 ],
                    "destination": [ "fade_line_a", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "js_voice", 5 ],
                    "destination": [ "fade_line_b", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "groove_a", 0 ],
                    "destination": [ "mul_fade_a_L", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "fade_line_a", 0 ],
                    "destination": [ "mul_fade_a_L", 1 ]
                }
            },
            {
                "patchline": {
                    "source": [ "groove_a", 1 ],
                    "destination": [ "mul_fade_a_R", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "fade_line_a", 0 ],
                    "destination": [ "mul_fade_a_R", 1 ]
                }
            },
            {
                "patchline": {
                    "source": [ "groove_b", 0 ],
                    "destination": [ "mul_fade_b_L", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "fade_line_b", 0 ],
                    "destination": [ "mul_fade_b_L", 1 ]
                }
            },
            {
                "patchline": {
                    "source": [ "groove_b", 1 ],
                    "destination": [ "mul_fade_b_R", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "fade_line_b", 0 ],
                    "destination": [ "mul_fade_b_R", 1 ]
                }
            },
            {
                "patchline": {
                    "source": [ "mul_fade_a_L", 0 ],
                    "destination": [ "sum_L", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "mul_fade_b_L", 0 ],
                    "destination": [ "sum_L", 1 ]
                }
            },
            {
                "patchline": {
                    "source": [ "mul_fade_a_R", 0 ],
                    "destination": [ "sum_R", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "mul_fade_b_R", 0 ],
                    "destination": [ "sum_R", 1 ]
                }
            },
            {
                "patchline": {
                    "source": [ "sum_L", 0 ],
                    "destination": [ "mul_vol_L", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "vol_line", 0 ],
                    "destination": [ "mul_vol_L", 1 ]
                }
            },
            {
                "patchline": {
                    "source": [ "sum_R", 0 ],
                    "destination": [ "mul_vol_R", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "vol_line", 0 ],
                    "destination": [ "mul_vol_R", 1 ]
                }
            },
            {
                "patchline": {
                    "source": [ "mul_vol_L", 0 ],
                    "destination": [ "out_L", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "mul_vol_R", 0 ],
                    "destination": [ "out_R", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "sig_speed_a", 0 ],
                    "destination": [ "groove_a", 0 ]
                }
            },
            {
                "patchline": {
                    "source": [ "sig_speed_b", 0 ],
                    "destination": [ "groove_b", 0 ]
                }
            }
        ]
    }
}
