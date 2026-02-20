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
        "rect": [
            134.0,
            95.0,
            1300.0,
            853.0
        ],
        "boxes": [
            {
                "box": {
                    "id": "title",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        15.0,
                        681.0,
                        20.0
                    ],
                    "text": "=== GEO-SONIFICATION: Data Hub (OSC \u2192 display + outlets). ==="
                }
            },
            {
                "box": {
                    "id": "osc_comment",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        48.0,
                        599.0,
                        20.0
                    ],
                    "text": "--- OSC INPUT: Port 7400. 15 messages per viewport update. ---"
                }
            },
            {
                "box": {
                    "id": "udp_recv",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        ""
                    ],
                    "patching_rect": [
                        20.0,
                        72.0,
                        120.0,
                        22.0
                    ],
                    "text": "udpreceive 7400"
                }
            },
            {
                "box": {
                    "id": "route_osc",
                    "maxclass": "newobj",
                    "numinlets": 5,
                    "numoutlets": 5,
                    "outlettype": [
                        "",
                        "",
                        "",
                        "",
                        ""
                    ],
                    "patching_rect": [
                        20.0,
                        100.0,
                        320.0,
                        22.0
                    ],
                    "text": "route /landcover /nightlight /population /forest"
                }
            },
            {
                "box": {
                    "id": "lab_landcover",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        138.0,
                        370.0,
                        20.0
                    ],
                    "text": "# landcover (int 10\u2013100) ESA WorldCover class, dominant land type"
                }
            },
            {
                "box": {
                    "id": "t_landcover",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "int"
                    ],
                    "patching_rect": [
                        20.0,
                        160.0,
                        65.0,
                        22.0
                    ],
                    "text": "unpack i"
                }
            },
            {
                "box": {
                    "id": "num_landcover",
                    "maxclass": "number",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        220.0,
                        160.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "comment": "",
                    "id": "out_landcover",
                    "index": 0,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        320.0,
                        160.0,
                        30.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_nightlight",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        198.0,
                        286.0,
                        20.0
                    ],
                    "text": "# nightlight (float 0\u20131) normalized VIIRS, 0 = no light"
                }
            },
            {
                "box": {
                    "id": "t_nightlight",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        20.0,
                        220.0,
                        65.0,
                        22.0
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_nightlight",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        220.0,
                        220.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "comment": "",
                    "id": "out_nightlight",
                    "index": 0,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        320.0,
                        220.0,
                        30.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_population",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        258.0,
                        323.0,
                        20.0
                    ],
                    "text": "# population (float 0\u20131) normalized density, 0 = uninhabited"
                }
            },
            {
                "box": {
                    "id": "t_population",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        20.0,
                        280.0,
                        65.0,
                        22.0
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_population",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        220.0,
                        280.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "comment": "",
                    "id": "out_population",
                    "index": 0,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        320.0,
                        280.0,
                        30.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_forest",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        318.0,
                        280.0,
                        20.0
                    ],
                    "text": "# forest (float 0\u20131) forest % on land, 0 = no forest"
                }
            },
            {
                "box": {
                    "id": "t_forest",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        20.0,
                        340.0,
                        65.0,
                        22.0
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_forest",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        220.0,
                        340.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "comment": "",
                    "id": "out_forest",
                    "index": 0,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        320.0,
                        340.0,
                        30.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_lc_section",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        390.0,
                        700.0,
                        20.0
                    ],
                    "text": "--- LANDCOVER DISTRIBUTION: 11 classes, each float 0\u20131 area fraction. ---"
                }
            },
            {
                "box": {
                    "id": "route_lc",
                    "maxclass": "newobj",
                    "numinlets": 12,
                    "numoutlets": 12,
                    "outlettype": [
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        ""
                    ],
                    "patching_rect": [
                        20.0,
                        418.0,
                        1000.0,
                        22.0
                    ],
                    "text": "route /lc/10 /lc/20 /lc/30 /lc/40 /lc/50 /lc/60 /lc/70 /lc/80 /lc/90 /lc/95 /lc/100"
                }
            },
            {
                "box": {
                    "id": "lab_lc10",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        454.0,
                        80.0,
                        20.0
                    ],
                    "text": "Tree/Forest"
                }
            },
            {
                "box": {
                    "id": "t_lc10",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        20.0,
                        476.0,
                        54.0,
                        22.0
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_lc10",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        20.0,
                        500.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "comment": "lc/10 Tree",
                    "id": "out_lc10",
                    "index": 0,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        526.0,
                        30.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_lc20",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        111.0,
                        454.0,
                        80.0,
                        20.0
                    ],
                    "text": "Shrubland"
                }
            },
            {
                "box": {
                    "id": "t_lc20",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        111.0,
                        476.0,
                        54.0,
                        22.0
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_lc20",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        111.0,
                        500.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "comment": "lc/20 Shrub",
                    "id": "out_lc20",
                    "index": 0,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        111.0,
                        526.0,
                        30.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_lc30",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        202.0,
                        454.0,
                        80.0,
                        20.0
                    ],
                    "text": "Grassland"
                }
            },
            {
                "box": {
                    "id": "t_lc30",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        202.0,
                        476.0,
                        54.0,
                        22.0
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_lc30",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        202.0,
                        500.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "comment": "lc/30 Grass",
                    "id": "out_lc30",
                    "index": 0,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        202.0,
                        526.0,
                        30.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_lc40",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        292.0,
                        454.0,
                        80.0,
                        20.0
                    ],
                    "text": "Cropland"
                }
            },
            {
                "box": {
                    "id": "t_lc40",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        292.0,
                        476.0,
                        54.0,
                        22.0
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_lc40",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        292.0,
                        500.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "comment": "lc/40 Crop",
                    "id": "out_lc40",
                    "index": 0,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        292.0,
                        526.0,
                        30.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_lc50",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        383.0,
                        454.0,
                        80.0,
                        20.0
                    ],
                    "text": "Urban"
                }
            },
            {
                "box": {
                    "id": "t_lc50",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        383.0,
                        476.0,
                        54.0,
                        22.0
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_lc50",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        383.0,
                        500.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "comment": "lc/50 Urban",
                    "id": "out_lc50",
                    "index": 0,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        383.0,
                        526.0,
                        30.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_lc60",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        474.0,
                        454.0,
                        80.0,
                        20.0
                    ],
                    "text": "Bare"
                }
            },
            {
                "box": {
                    "id": "t_lc60",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        474.0,
                        476.0,
                        54.0,
                        22.0
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_lc60",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        474.0,
                        500.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "comment": "lc/60 Bare",
                    "id": "out_lc60",
                    "index": 0,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        474.0,
                        526.0,
                        30.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_lc70",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        565.0,
                        454.0,
                        80.0,
                        20.0
                    ],
                    "text": "Snow/Ice"
                }
            },
            {
                "box": {
                    "id": "t_lc70",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        565.0,
                        476.0,
                        54.0,
                        22.0
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_lc70",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        565.0,
                        500.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "comment": "lc/70 Snow",
                    "id": "out_lc70",
                    "index": 0,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        565.0,
                        526.0,
                        30.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_lc80",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        656.0,
                        454.0,
                        80.0,
                        20.0
                    ],
                    "text": "Water"
                }
            },
            {
                "box": {
                    "id": "t_lc80",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        656.0,
                        476.0,
                        54.0,
                        22.0
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_lc80",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        656.0,
                        500.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "comment": "lc/80 Water",
                    "id": "out_lc80",
                    "index": 0,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        656.0,
                        526.0,
                        30.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_lc90",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        746.0,
                        454.0,
                        80.0,
                        20.0
                    ],
                    "text": "Wetland"
                }
            },
            {
                "box": {
                    "id": "t_lc90",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        746.0,
                        476.0,
                        54.0,
                        22.0
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_lc90",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        746.0,
                        500.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "comment": "lc/90 Wetland",
                    "id": "out_lc90",
                    "index": 0,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        746.0,
                        526.0,
                        30.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_lc95",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        837.0,
                        454.0,
                        80.0,
                        20.0
                    ],
                    "text": "Mangroves"
                }
            },
            {
                "box": {
                    "id": "t_lc95",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        837.0,
                        476.0,
                        54.0,
                        22.0
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_lc95",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        837.0,
                        500.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "comment": "lc/95 Mangrove",
                    "id": "out_lc95",
                    "index": 0,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        837.0,
                        526.0,
                        30.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_lc100",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        928.0,
                        454.0,
                        80.0,
                        20.0
                    ],
                    "text": "Moss/Lichen"
                }
            },
            {
                "box": {
                    "id": "t_lc100",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        928.0,
                        476.0,
                        54.0,
                        22.0
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_lc100",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        928.0,
                        500.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "comment": "lc/100 Moss",
                    "id": "out_lc100",
                    "index": 0,
                    "maxclass": "outlet",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        928.0,
                        526.0,
                        30.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_pergrid_section",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        572.0,
                        700.0,
                        20.0
                    ],
                    "text": "--- PER-GRID MODE: individual cell data when zoomed in (threshold-based). ---"
                }
            },
            {
                "box": {
                    "id": "route_grid",
                    "maxclass": "newobj",
                    "numinlets": 6,
                    "numoutlets": 6,
                    "outlettype": [
                        "",
                        "",
                        "",
                        "",
                        "",
                        ""
                    ],
                    "patching_rect": [
                        20.0,
                        600.0,
                        480.0,
                        22.0
                    ],
                    "text": "route /grid/count /grid/pos /grid/lc /grid /viewport"
                }
            },
            {
                "box": {
                    "id": "print_gridcount",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        636.0,
                        100.0,
                        22.0
                    ],
                    "text": "print grid_count"
                }
            },
            {
                "box": {
                    "id": "grid_pos_unpack",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "float",
                        "float"
                    ],
                    "patching_rect": [
                        130.0,
                        636.0,
                        80.0,
                        22.0
                    ],
                    "text": "unpack f f"
                }
            },
            {
                "box": {
                    "id": "print_grid_pos",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        130.0,
                        680.0,
                        100.0,
                        22.0
                    ],
                    "text": "print grid_pos"
                }
            },
            {
                "box": {
                    "id": "grid_lc_unpack",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 11,
                    "outlettype": [
                        "float",
                        "float",
                        "float",
                        "float",
                        "float",
                        "float",
                        "float",
                        "float",
                        "float",
                        "float",
                        "float"
                    ],
                    "patching_rect": [
                        220.0,
                        636.0,
                        200.0,
                        22.0
                    ],
                    "text": "unpack f f f f f f f f f f f"
                }
            },
            {
                "box": {
                    "id": "print_grid_lc",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        240.0,
                        680.0,
                        100.0,
                        22.0
                    ],
                    "text": "print grid_lc"
                }
            },
            {
                "box": {
                    "id": "grid_data_route",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 6,
                    "outlettype": [
                        "float",
                        "float",
                        "int",
                        "float",
                        "float",
                        "float"
                    ],
                    "patching_rect": [
                        440.0,
                        636.0,
                        120.0,
                        22.0
                    ],
                    "text": "unpack f f i f f f"
                }
            },
            {
                "box": {
                    "id": "print_grid_data",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        440.0,
                        680.0,
                        100.0,
                        22.0
                    ],
                    "text": "print grid_data"
                }
            },
            {
                "box": {
                    "id": "print_viewport",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        580.0,
                        636.0,
                        100.0,
                        22.0
                    ],
                    "text": "print viewport"
                }
            },
            {
                "box": {
                    "id": "lab_signals",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        780.0,
                        460.0,
                        20.0
                    ],
                    "text": "--- VIEWPORT SIGNALS: /proximity, /delta/lc, /coverage ---"
                }
            },
            {
                "box": {
                    "id": "route_signals",
                    "maxclass": "newobj",
                    "numinlets": 4,
                    "numoutlets": 4,
                    "outlettype": [
                        "",
                        "",
                        "",
                        ""
                    ],
                    "patching_rect": [
                        20.0,
                        810.0,
                        1000.0,
                        22.0
                    ],
                    "text": "route /proximity /delta/lc /coverage"
                }
            },
            {
                "box": {
                    "id": "t_proximity",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        20.0,
                        850.0,
                        65.0,
                        22.0
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_proximity",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        90.0,
                        850.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "t_coverage",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        820.0,
                        850.0,
                        65.0,
                        22.0
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_coverage",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        890.0,
                        850.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_prox",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        874.0,
                        80.0,
                        20.0
                    ],
                    "text": "proximity"
                }
            },
            {
                "box": {
                    "id": "lab_cov",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        820.0,
                        874.0,
                        80.0,
                        20.0
                    ],
                    "text": "coverage"
                }
            },
            {
                "box": {
                    "id": "lab_crossfade",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        1020.0,
                        500.0,
                        20.0
                    ],
                    "text": "--- CROSSFADE CONTROLLER: 11 smoothed volumes ---"
                }
            },
            {
                "box": {
                    "id": "js_crossfade",
                    "maxclass": "newobj",
                    "numinlets": 12,
                    "numoutlets": 11,
                    "outlettype": [
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        ""
                    ],
                    "patching_rect": [
                        20.0,
                        1050.0,
                        1000.0,
                        22.0
                    ],
                    "saved_object_attributes": {
                        "filename": "crossfade_controller.js",
                        "parameter_enable": 0
                    },
                    "text": "js crossfade_controller.js"
                }
            },
            {
                "box": {
                    "id": "lab_foldmap",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        1080.0,
                        500.0,
                        20.0
                    ],
                    "text": "--- FOLD-MAPPING: 11 ch \u2192 5 buses (Tree / Crop / Urban / Bare / Water) ---"
                }
            },
            {
                "box": {
                    "id": "lab_col_tree_l",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        1106.0,
                        155.0,
                        20.0
                    ],
                    "text": "Tree left (10,20,30)"
                }
            },
            {
                "box": {
                    "id": "lab_col_tree_r",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        819.0,
                        1106.0,
                        160.0,
                        20.0
                    ],
                    "text": "Tree right (90,95,100)"
                }
            },
            {
                "box": {
                    "id": "tree_add1",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        20.0,
                        1130.0,
                        101.0,
                        22.0
                    ],
                    "text": "+ 0."
                }
            },
            {
                "box": {
                    "id": "tree_add2",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        20.0,
                        1162.0,
                        201.0,
                        22.0
                    ],
                    "text": "+ 0."
                }
            },
            {
                "box": {
                    "id": "tree_add3",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        819.0,
                        1130.0,
                        101.0,
                        22.0
                    ],
                    "text": "+ 0."
                }
            },
            {
                "box": {
                    "id": "tree_add4",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        819.0,
                        1162.0,
                        201.0,
                        22.0
                    ],
                    "text": "+ 0."
                }
            },
            {
                "box": {
                    "id": "tree_add5",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        20.0,
                        1212.0,
                        800.0,
                        22.0
                    ],
                    "text": "+ 0."
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_tree_bus",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        20.0,
                        1292.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_tree_bus",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        1316.0,
                        250.0,
                        20.0
                    ],
                    "text": "Tree bus (10,20,30,90,95,100)"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_crop_bus",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        320.0,
                        1292.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_crop_bus",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        320.0,
                        1316.0,
                        82.0,
                        20.0
                    ],
                    "text": "Crop bus (40)"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_urban_bus",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        420.0,
                        1292.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_urban_bus",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        420.0,
                        1316.0,
                        89.0,
                        20.0
                    ],
                    "text": "Urban bus (50)"
                }
            },
            {
                "box": {
                    "id": "water_add1",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        619.0,
                        1130.0,
                        101.0,
                        22.0
                    ],
                    "text": "+ 0."
                }
            },
            {
                "box": {
                    "id": "js_water_bus",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        ""
                    ],
                    "patching_rect": [
                        619.0,
                        1238.0,
                        150.0,
                        22.0
                    ],
                    "saved_object_attributes": {
                        "filename": "water_bus.js",
                        "parameter_enable": 0
                    },
                    "text": "js water_bus.js"
                }
            },
            {
                "box": {
                    "id": "water_max",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 2,
                    "outlettype": [
                        "float",
                        "int"
                    ],
                    "patching_rect": [
                        619.0,
                        1264.0,
                        80.0,
                        22.0
                    ],
                    "text": "maximum 0."
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_bare_bus",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        520.0,
                        1292.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_bare_bus",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        520.0,
                        1316.0,
                        81.0,
                        20.0
                    ],
                    "text": "Bare bus (60)"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_water_bus",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        619.0,
                        1292.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_water_bus",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        619.0,
                        1316.0,
                        200.0,
                        20.0
                    ],
                    "text": "Water bus (70,80,ocean)"
                }
            },
            {
                "box": {
                    "id": "lab_icontrig",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        1380.0,
                        400.0,
                        20.0
                    ],
                    "text": "--- ICON TRIGGER: probabilistic auditory icons ---"
                }
            },
            {
                "box": {
                    "id": "js_icontrig",
                    "maxclass": "newobj",
                    "numinlets": 13,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        ""
                    ],
                    "patching_rect": [
                        20.0,
                        1410.0,
                        1091.0,
                        22.0
                    ],
                    "saved_object_attributes": {
                        "filename": "icon_trigger.js",
                        "parameter_enable": 0
                    },
                    "text": "js icon_trigger.js"
                }
            },
            {
                "box": {
                    "id": "toggle_icon",
                    "maxclass": "toggle",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "int"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        1110.0,
                        1360.0,
                        20.0,
                        20.0
                    ]
                }
            },
            {
                "box": {
                    "id": "metro_icon",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "bang"
                    ],
                    "patching_rect": [
                        1110.0,
                        1385.0,
                        70.0,
                        22.0
                    ],
                    "text": "metro 100"
                }
            },
            {
                "box": {
                    "id": "lab_metro",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        1110.0,
                        1415.0,
                        160.0,
                        20.0
                    ],
                    "text": "metro \u2192 bang (inlet 12)"
                }
            },
            {
                "box": {
                    "id": "num_icon_cat",
                    "maxclass": "number",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        20.0,
                        1460.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_icon_int",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        1110.0,
                        1460.0,
                        60.0,
                        22.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_icon_cat",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        1484.0,
                        80.0,
                        20.0
                    ],
                    "text": "category"
                }
            },
            {
                "box": {
                    "id": "lab_icon_int",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        1110.0,
                        1484.0,
                        80.0,
                        20.0
                    ],
                    "text": "intensity"
                }
            },
            {
                "box": {
                    "id": "lab_audio",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        1540.0,
                        700.0,
                        20.0
                    ],
                    "text": "--- AUDIO LAYER: Loop playback, crossfade, stereo mix, dac~ ---"
                }
            },
            {
                "box": {
                    "id": "dsp_toggle",
                    "maxclass": "toggle",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "int"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        20.0,
                        1570.0,
                        24.0,
                        24.0
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_dsp_toggle",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        50.0,
                        1572.0,
                        130.0,
                        20.0
                    ],
                    "text": "DSP + Loop on/off"
                }
            },
            {
                "box": {
                    "id": "dsp_sel",
                    "maxclass": "newobj",
                    "numinlets": 3,
                    "numoutlets": 3,
                    "outlettype": [
                        "bang",
                        "bang",
                        ""
                    ],
                    "patching_rect": [
                        20.0,
                        1600.0,
                        60.0,
                        22.0
                    ],
                    "text": "sel 1 0"
                }
            },
            {
                "box": {
                    "id": "on_trigger",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "bang",
                        "bang"
                    ],
                    "patching_rect": [
                        20.0,
                        1630.0,
                        50.0,
                        22.0
                    ],
                    "text": "t b b"
                }
            },
            {
                "box": {
                    "id": "dsp_on_msg",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        ""
                    ],
                    "patching_rect": [
                        50.0,
                        1660.0,
                        70.0,
                        22.0
                    ],
                    "text": "\\; max dsp 1"
                }
            },
            {
                "box": {
                    "id": "on_delay",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "bang"
                    ],
                    "patching_rect": [
                        20.0,
                        1660.0,
                        60.0,
                        22.0
                    ],
                    "text": "delay 50"
                }
            },
            {
                "box": {
                    "id": "clock_start_msg",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        ""
                    ],
                    "patching_rect": [
                        20.0,
                        1690.0,
                        45.0,
                        22.0
                    ],
                    "text": "start"
                }
            },
            {
                "box": {
                    "id": "off_trigger",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "bang",
                        "bang"
                    ],
                    "patching_rect": [
                        150.0,
                        1630.0,
                        50.0,
                        22.0
                    ],
                    "text": "t b b"
                }
            },
            {
                "box": {
                    "id": "clock_stop_msg",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        ""
                    ],
                    "patching_rect": [
                        180.0,
                        1660.0,
                        38.0,
                        22.0
                    ],
                    "text": "stop"
                }
            },
            {
                "box": {
                    "id": "off_delay",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "bang"
                    ],
                    "patching_rect": [
                        150.0,
                        1660.0,
                        68.0,
                        22.0
                    ],
                    "text": "delay 100"
                }
            },
            {
                "box": {
                    "id": "dsp_off_msg",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        ""
                    ],
                    "patching_rect": [
                        150.0,
                        1690.0,
                        70.0,
                        22.0
                    ],
                    "text": "\\; max dsp 0"
                }
            },
            {
                "box": {
                    "id": "js_clock",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        ""
                    ],
                    "patching_rect": [
                        20.0,
                        1740.0,
                        120.0,
                        22.0
                    ],
                    "text": "js loop_clock.js"
                }
            },
            {
                "box": {
                    "id": "clock_route",
                    "maxclass": "newobj",
                    "numinlets": 4,
                    "numoutlets": 4,
                    "outlettype": [
                        "",
                        "",
                        "",
                        ""
                    ],
                    "patching_rect": [
                        20.0,
                        1770.0,
                        200.0,
                        22.0
                    ],
                    "text": "route go xfade stop"
                }
            },
            {
                "box": {
                    "id": "send_loop_go",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        1800.0,
                        130.0,
                        22.0
                    ],
                    "text": "s geosoni_loop_go"
                }
            },
            {
                "box": {
                    "id": "send_xfade",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        160.0,
                        1800.0,
                        120.0,
                        22.0
                    ],
                    "text": "s geosoni_xfade"
                }
            },
            {
                "box": {
                    "id": "send_loop_stop",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        290.0,
                        1800.0,
                        140.0,
                        22.0
                    ],
                    "text": "s geosoni_loop_stop"
                }
            },
            {
                "box": {
                    "id": "recv_buflen",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [
                        ""
                    ],
                    "patching_rect": [
                        300.0,
                        1710.0,
                        130.0,
                        22.0
                    ],
                    "text": "r geosoni_buflen"
                }
            },
            {
                "box": {
                    "id": "prepend_buflen",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        ""
                    ],
                    "patching_rect": [
                        300.0,
                        1740.0,
                        100.0,
                        22.0
                    ],
                    "text": "prepend buflen"
                }
            },
            {
                "box": {
                    "id": "lab_buses",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        1850.0,
                        600.0,
                        20.0
                    ],
                    "text": "--- LOOP BUSES: 5 \u00d7 loop_bus abstraction (double-buffered crossfade playback) ---"
                }
            },
            {
                "box": {
                    "id": "loop_tree",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "signal",
                        "signal"
                    ],
                    "patching_rect": [
                        20.0,
                        1880.0,
                        160.0,
                        22.0
                    ],
                    "text": "p loop_bus_tree",
                    "saved_object_attributes": {
                        "description": "",
                        "digest": "",
                        "globalpatchername": "",
                        "tags": ""
                    },
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
                        "rect": [
                            100.0,
                            100.0,
                            900.0,
                            750.0
                        ],
                        "boxes": [
                            {
                                "box": {
                                    "id": "title_comment",
                                    "maxclass": "comment",
                                    "numinlets": 1,
                                    "numoutlets": 0,
                                    "patching_rect": [
                                        20.0,
                                        10.0,
                                        500.0,
                                        20.0
                                    ],
                                    "text": "=== LOOP BUS: tree \u2014 double-buffered crossfade loop playback ==="
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
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        20.0,
                                        50.0,
                                        30.0,
                                        30.0
                                    ]
                                }
                            },
                            {
                                "box": {
                                    "id": "vol_pack",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        20.0,
                                        90.0,
                                        70.0,
                                        22.0
                                    ],
                                    "text": "pack f 20"
                                }
                            },
                            {
                                "box": {
                                    "id": "vol_line",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "signal",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        20.0,
                                        120.0,
                                        55.0,
                                        22.0
                                    ],
                                    "text": "line~ 0."
                                }
                            },
                            {
                                "box": {
                                    "id": "buffer_obj",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "float",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        600.0,
                                        50.0,
                                        150.0,
                                        22.0
                                    ],
                                    "text": "buffer~ loop_tree"
                                }
                            },
                            {
                                "box": {
                                    "id": "buf_loadmess",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        600.0,
                                        80.0,
                                        270.0,
                                        22.0
                                    ],
                                    "text": "loadmess replace /Users/halic/Installed/geo-sonification/sonification/samples/ambience/tree.wav"
                                }
                            },
                            {
                                "box": {
                                    "id": "info_obj",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 11,
                                    "outlettype": [
                                        "float",
                                        "list",
                                        "float",
                                        "float",
                                        "float",
                                        "float",
                                        "float",
                                        "float",
                                        "",
                                        "int",
                                        ""
                                    ],
                                    "patching_rect": [
                                        600.0,
                                        130.0,
                                        130.0,
                                        22.0
                                    ],
                                    "text": "info~ loop_tree"
                                }
                            },
                            {
                                "box": {
                                    "id": "send_buflen",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 0,
                                    "patching_rect": [
                                        600.0,
                                        160.0,
                                        130.0,
                                        22.0
                                    ],
                                    "text": "s geosoni_buflen"
                                }
                            },
                            {
                                "box": {
                                    "id": "recv_go",
                                    "maxclass": "newobj",
                                    "numinlets": 0,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        150.0,
                                        170.0,
                                        140.0,
                                        22.0
                                    ],
                                    "text": "r geosoni_loop_go"
                                }
                            },
                            {
                                "box": {
                                    "id": "msg_start",
                                    "maxclass": "message",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        150.0,
                                        200.0,
                                        85.0,
                                        22.0
                                    ],
                                    "text": "start_playing"
                                }
                            },
                            {
                                "box": {
                                    "id": "recv_xfade",
                                    "maxclass": "newobj",
                                    "numinlets": 0,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        280.0,
                                        170.0,
                                        120.0,
                                        22.0
                                    ],
                                    "text": "r geosoni_xfade"
                                }
                            },
                            {
                                "box": {
                                    "id": "msg_xfade",
                                    "maxclass": "message",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        280.0,
                                        200.0,
                                        45.0,
                                        22.0
                                    ],
                                    "text": "xfade"
                                }
                            },
                            {
                                "box": {
                                    "id": "recv_stop",
                                    "maxclass": "newobj",
                                    "numinlets": 0,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        420.0,
                                        170.0,
                                        140.0,
                                        22.0
                                    ],
                                    "text": "r geosoni_loop_stop"
                                }
                            },
                            {
                                "box": {
                                    "id": "msg_stop",
                                    "maxclass": "message",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        420.0,
                                        200.0,
                                        38.0,
                                        22.0
                                    ],
                                    "text": "stop"
                                }
                            },
                            {
                                "box": {
                                    "id": "js_voice",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 6,
                                    "outlettype": [
                                        "",
                                        "",
                                        "",
                                        "",
                                        "",
                                        ""
                                    ],
                                    "patching_rect": [
                                        150.0,
                                        240.0,
                                        400.0,
                                        22.0
                                    ],
                                    "text": "js loop_voice.js"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_a",
                                    "maxclass": "newobj",
                                    "numinlets": 3,
                                    "numoutlets": 3,
                                    "outlettype": [
                                        "signal",
                                        "signal",
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        340.0,
                                        150.0,
                                        22.0
                                    ],
                                    "text": "groove~ loop_tree 2"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_a_loopoff",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        310.0,
                                        90.0,
                                        22.0
                                    ],
                                    "text": "loadmess loop 0"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_b",
                                    "maxclass": "newobj",
                                    "numinlets": 3,
                                    "numoutlets": 3,
                                    "outlettype": [
                                        "signal",
                                        "signal",
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        340.0,
                                        150.0,
                                        22.0
                                    ],
                                    "text": "groove~ loop_tree 2"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_b_loopoff",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        310.0,
                                        90.0,
                                        22.0
                                    ],
                                    "text": "loadmess loop 0"
                                }
                            },
                            {
                                "box": {
                                    "id": "fade_line_a",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "signal",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        220.0,
                                        380.0,
                                        55.0,
                                        22.0
                                    ],
                                    "text": "line~ 0."
                                }
                            },
                            {
                                "box": {
                                    "id": "fade_line_b",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "signal",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        570.0,
                                        380.0,
                                        55.0,
                                        22.0
                                    ],
                                    "text": "line~ 0."
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_a_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_a_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        130.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_b_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_b_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        480.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "sum_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        470.0,
                                        370.0,
                                        22.0
                                    ],
                                    "text": "+~"
                                }
                            },
                            {
                                "box": {
                                    "id": "sum_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        130.0,
                                        500.0,
                                        370.0,
                                        22.0
                                    ],
                                    "text": "+~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_vol_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        540.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_vol_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        130.0,
                                        540.0,
                                        40.0,
                                        22.0
                                    ],
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
                                    "patching_rect": [
                                        50.0,
                                        590.0,
                                        30.0,
                                        30.0
                                    ]
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
                                    "patching_rect": [
                                        130.0,
                                        590.0,
                                        30.0,
                                        30.0
                                    ]
                                }
                            },
                            {
                                "box": {
                                    "id": "sig_speed_a",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        280.0,
                                        45.0,
                                        22.0
                                    ],
                                    "text": "sig~ 1."
                                }
                            },
                            {
                                "box": {
                                    "id": "sig_speed_b",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        280.0,
                                        45.0,
                                        22.0
                                    ],
                                    "text": "sig~ 1."
                                }
                            }
                        ],
                        "lines": [
                            {
                                "patchline": {
                                    "source": [
                                        "vol_inlet",
                                        0
                                    ],
                                    "destination": [
                                        "vol_pack",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "vol_pack",
                                        0
                                    ],
                                    "destination": [
                                        "vol_line",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "buf_loadmess",
                                        0
                                    ],
                                    "destination": [
                                        "buffer_obj",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "buffer_obj",
                                        1
                                    ],
                                    "destination": [
                                        "info_obj",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "info_obj",
                                        6
                                    ],
                                    "destination": [
                                        "send_buflen",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "recv_go",
                                        0
                                    ],
                                    "destination": [
                                        "msg_start",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "msg_start",
                                        0
                                    ],
                                    "destination": [
                                        "js_voice",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "recv_xfade",
                                        0
                                    ],
                                    "destination": [
                                        "msg_xfade",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "msg_xfade",
                                        0
                                    ],
                                    "destination": [
                                        "js_voice",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "recv_stop",
                                        0
                                    ],
                                    "destination": [
                                        "msg_stop",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "msg_stop",
                                        0
                                    ],
                                    "destination": [
                                        "js_voice",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_a_loopoff",
                                        0
                                    ],
                                    "destination": [
                                        "groove_a",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_b_loopoff",
                                        0
                                    ],
                                    "destination": [
                                        "groove_b",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        1
                                    ],
                                    "destination": [
                                        "groove_a",
                                        1
                                    ],
                                    "midpoints": [
                                        229.5,
                                        270.0,
                                        125.0,
                                        270.0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        3
                                    ],
                                    "destination": [
                                        "groove_b",
                                        1
                                    ],
                                    "midpoints": [
                                        369.5,
                                        270.0,
                                        475.0,
                                        270.0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        4
                                    ],
                                    "destination": [
                                        "fade_line_a",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        5
                                    ],
                                    "destination": [
                                        "fade_line_b",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_a",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_a_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_a",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_a_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_a",
                                        1
                                    ],
                                    "destination": [
                                        "mul_fade_a_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_a",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_a_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_b",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_b_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_b",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_b_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_b",
                                        1
                                    ],
                                    "destination": [
                                        "mul_fade_b_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_b",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_b_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_a_L",
                                        0
                                    ],
                                    "destination": [
                                        "sum_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_b_L",
                                        0
                                    ],
                                    "destination": [
                                        "sum_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_a_R",
                                        0
                                    ],
                                    "destination": [
                                        "sum_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_b_R",
                                        0
                                    ],
                                    "destination": [
                                        "sum_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sum_L",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "vol_line",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sum_R",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "vol_line",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_vol_L",
                                        0
                                    ],
                                    "destination": [
                                        "out_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_vol_R",
                                        0
                                    ],
                                    "destination": [
                                        "out_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sig_speed_a",
                                        0
                                    ],
                                    "destination": [
                                        "groove_a",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sig_speed_b",
                                        0
                                    ],
                                    "destination": [
                                        "groove_b",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        0
                                    ],
                                    "destination": [
                                        "groove_a",
                                        0
                                    ],
                                    "midpoints": [
                                        159.5,
                                        270.0,
                                        59.5,
                                        270.0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        2
                                    ],
                                    "destination": [
                                        "groove_b",
                                        0
                                    ],
                                    "midpoints": [
                                        299.5,
                                        270.0,
                                        409.5,
                                        270.0
                                    ]
                                }
                            }
                        ]
                    }
                }
            },
            {
                "box": {
                    "id": "loop_crop",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "signal",
                        "signal"
                    ],
                    "patching_rect": [
                        220.0,
                        1880.0,
                        160.0,
                        22.0
                    ],
                    "text": "p loop_bus_crop",
                    "saved_object_attributes": {
                        "description": "",
                        "digest": "",
                        "globalpatchername": "",
                        "tags": ""
                    },
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
                        "rect": [
                            100.0,
                            100.0,
                            900.0,
                            750.0
                        ],
                        "boxes": [
                            {
                                "box": {
                                    "id": "title_comment",
                                    "maxclass": "comment",
                                    "numinlets": 1,
                                    "numoutlets": 0,
                                    "patching_rect": [
                                        20.0,
                                        10.0,
                                        500.0,
                                        20.0
                                    ],
                                    "text": "=== LOOP BUS: crop \u2014 double-buffered crossfade loop playback ==="
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
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        20.0,
                                        50.0,
                                        30.0,
                                        30.0
                                    ]
                                }
                            },
                            {
                                "box": {
                                    "id": "vol_pack",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        20.0,
                                        90.0,
                                        70.0,
                                        22.0
                                    ],
                                    "text": "pack f 20"
                                }
                            },
                            {
                                "box": {
                                    "id": "vol_line",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "signal",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        20.0,
                                        120.0,
                                        55.0,
                                        22.0
                                    ],
                                    "text": "line~ 0."
                                }
                            },
                            {
                                "box": {
                                    "id": "buffer_obj",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "float",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        600.0,
                                        50.0,
                                        150.0,
                                        22.0
                                    ],
                                    "text": "buffer~ loop_crop"
                                }
                            },
                            {
                                "box": {
                                    "id": "buf_loadmess",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        600.0,
                                        80.0,
                                        270.0,
                                        22.0
                                    ],
                                    "text": "loadmess replace /Users/halic/Installed/geo-sonification/sonification/samples/ambience/crop.wav"
                                }
                            },
                            {
                                "box": {
                                    "id": "info_obj",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 11,
                                    "outlettype": [
                                        "float",
                                        "list",
                                        "float",
                                        "float",
                                        "float",
                                        "float",
                                        "float",
                                        "float",
                                        "",
                                        "int",
                                        ""
                                    ],
                                    "patching_rect": [
                                        600.0,
                                        130.0,
                                        130.0,
                                        22.0
                                    ],
                                    "text": "info~ loop_crop"
                                }
                            },
                            {
                                "box": {
                                    "id": "send_buflen",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 0,
                                    "patching_rect": [
                                        600.0,
                                        160.0,
                                        130.0,
                                        22.0
                                    ],
                                    "text": "s geosoni_buflen"
                                }
                            },
                            {
                                "box": {
                                    "id": "recv_go",
                                    "maxclass": "newobj",
                                    "numinlets": 0,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        150.0,
                                        170.0,
                                        140.0,
                                        22.0
                                    ],
                                    "text": "r geosoni_loop_go"
                                }
                            },
                            {
                                "box": {
                                    "id": "msg_start",
                                    "maxclass": "message",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        150.0,
                                        200.0,
                                        85.0,
                                        22.0
                                    ],
                                    "text": "start_playing"
                                }
                            },
                            {
                                "box": {
                                    "id": "recv_xfade",
                                    "maxclass": "newobj",
                                    "numinlets": 0,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        280.0,
                                        170.0,
                                        120.0,
                                        22.0
                                    ],
                                    "text": "r geosoni_xfade"
                                }
                            },
                            {
                                "box": {
                                    "id": "msg_xfade",
                                    "maxclass": "message",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        280.0,
                                        200.0,
                                        45.0,
                                        22.0
                                    ],
                                    "text": "xfade"
                                }
                            },
                            {
                                "box": {
                                    "id": "recv_stop",
                                    "maxclass": "newobj",
                                    "numinlets": 0,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        420.0,
                                        170.0,
                                        140.0,
                                        22.0
                                    ],
                                    "text": "r geosoni_loop_stop"
                                }
                            },
                            {
                                "box": {
                                    "id": "msg_stop",
                                    "maxclass": "message",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        420.0,
                                        200.0,
                                        38.0,
                                        22.0
                                    ],
                                    "text": "stop"
                                }
                            },
                            {
                                "box": {
                                    "id": "js_voice",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 6,
                                    "outlettype": [
                                        "",
                                        "",
                                        "",
                                        "",
                                        "",
                                        ""
                                    ],
                                    "patching_rect": [
                                        150.0,
                                        240.0,
                                        400.0,
                                        22.0
                                    ],
                                    "text": "js loop_voice.js"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_a",
                                    "maxclass": "newobj",
                                    "numinlets": 3,
                                    "numoutlets": 3,
                                    "outlettype": [
                                        "signal",
                                        "signal",
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        340.0,
                                        150.0,
                                        22.0
                                    ],
                                    "text": "groove~ loop_crop 2"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_a_loopoff",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        310.0,
                                        90.0,
                                        22.0
                                    ],
                                    "text": "loadmess loop 0"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_b",
                                    "maxclass": "newobj",
                                    "numinlets": 3,
                                    "numoutlets": 3,
                                    "outlettype": [
                                        "signal",
                                        "signal",
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        340.0,
                                        150.0,
                                        22.0
                                    ],
                                    "text": "groove~ loop_crop 2"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_b_loopoff",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        310.0,
                                        90.0,
                                        22.0
                                    ],
                                    "text": "loadmess loop 0"
                                }
                            },
                            {
                                "box": {
                                    "id": "fade_line_a",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "signal",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        220.0,
                                        380.0,
                                        55.0,
                                        22.0
                                    ],
                                    "text": "line~ 0."
                                }
                            },
                            {
                                "box": {
                                    "id": "fade_line_b",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "signal",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        570.0,
                                        380.0,
                                        55.0,
                                        22.0
                                    ],
                                    "text": "line~ 0."
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_a_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_a_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        130.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_b_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_b_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        480.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "sum_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        470.0,
                                        370.0,
                                        22.0
                                    ],
                                    "text": "+~"
                                }
                            },
                            {
                                "box": {
                                    "id": "sum_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        130.0,
                                        500.0,
                                        370.0,
                                        22.0
                                    ],
                                    "text": "+~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_vol_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        540.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_vol_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        130.0,
                                        540.0,
                                        40.0,
                                        22.0
                                    ],
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
                                    "patching_rect": [
                                        50.0,
                                        590.0,
                                        30.0,
                                        30.0
                                    ]
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
                                    "patching_rect": [
                                        130.0,
                                        590.0,
                                        30.0,
                                        30.0
                                    ]
                                }
                            },
                            {
                                "box": {
                                    "id": "sig_speed_a",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        280.0,
                                        45.0,
                                        22.0
                                    ],
                                    "text": "sig~ 1."
                                }
                            },
                            {
                                "box": {
                                    "id": "sig_speed_b",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        280.0,
                                        45.0,
                                        22.0
                                    ],
                                    "text": "sig~ 1."
                                }
                            }
                        ],
                        "lines": [
                            {
                                "patchline": {
                                    "source": [
                                        "vol_inlet",
                                        0
                                    ],
                                    "destination": [
                                        "vol_pack",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "vol_pack",
                                        0
                                    ],
                                    "destination": [
                                        "vol_line",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "buf_loadmess",
                                        0
                                    ],
                                    "destination": [
                                        "buffer_obj",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "buffer_obj",
                                        1
                                    ],
                                    "destination": [
                                        "info_obj",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "info_obj",
                                        6
                                    ],
                                    "destination": [
                                        "send_buflen",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "recv_go",
                                        0
                                    ],
                                    "destination": [
                                        "msg_start",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "msg_start",
                                        0
                                    ],
                                    "destination": [
                                        "js_voice",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "recv_xfade",
                                        0
                                    ],
                                    "destination": [
                                        "msg_xfade",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "msg_xfade",
                                        0
                                    ],
                                    "destination": [
                                        "js_voice",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "recv_stop",
                                        0
                                    ],
                                    "destination": [
                                        "msg_stop",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "msg_stop",
                                        0
                                    ],
                                    "destination": [
                                        "js_voice",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_a_loopoff",
                                        0
                                    ],
                                    "destination": [
                                        "groove_a",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_b_loopoff",
                                        0
                                    ],
                                    "destination": [
                                        "groove_b",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        1
                                    ],
                                    "destination": [
                                        "groove_a",
                                        1
                                    ],
                                    "midpoints": [
                                        229.5,
                                        270.0,
                                        125.0,
                                        270.0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        3
                                    ],
                                    "destination": [
                                        "groove_b",
                                        1
                                    ],
                                    "midpoints": [
                                        369.5,
                                        270.0,
                                        475.0,
                                        270.0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        4
                                    ],
                                    "destination": [
                                        "fade_line_a",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        5
                                    ],
                                    "destination": [
                                        "fade_line_b",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_a",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_a_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_a",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_a_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_a",
                                        1
                                    ],
                                    "destination": [
                                        "mul_fade_a_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_a",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_a_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_b",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_b_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_b",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_b_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_b",
                                        1
                                    ],
                                    "destination": [
                                        "mul_fade_b_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_b",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_b_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_a_L",
                                        0
                                    ],
                                    "destination": [
                                        "sum_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_b_L",
                                        0
                                    ],
                                    "destination": [
                                        "sum_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_a_R",
                                        0
                                    ],
                                    "destination": [
                                        "sum_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_b_R",
                                        0
                                    ],
                                    "destination": [
                                        "sum_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sum_L",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "vol_line",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sum_R",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "vol_line",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_vol_L",
                                        0
                                    ],
                                    "destination": [
                                        "out_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_vol_R",
                                        0
                                    ],
                                    "destination": [
                                        "out_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sig_speed_a",
                                        0
                                    ],
                                    "destination": [
                                        "groove_a",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sig_speed_b",
                                        0
                                    ],
                                    "destination": [
                                        "groove_b",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        0
                                    ],
                                    "destination": [
                                        "groove_a",
                                        0
                                    ],
                                    "midpoints": [
                                        159.5,
                                        270.0,
                                        59.5,
                                        270.0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        2
                                    ],
                                    "destination": [
                                        "groove_b",
                                        0
                                    ],
                                    "midpoints": [
                                        299.5,
                                        270.0,
                                        409.5,
                                        270.0
                                    ]
                                }
                            }
                        ]
                    }
                }
            },
            {
                "box": {
                    "id": "loop_urban",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "signal",
                        "signal"
                    ],
                    "patching_rect": [
                        420.0,
                        1880.0,
                        160.0,
                        22.0
                    ],
                    "text": "p loop_bus_urban",
                    "saved_object_attributes": {
                        "description": "",
                        "digest": "",
                        "globalpatchername": "",
                        "tags": ""
                    },
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
                        "rect": [
                            100.0,
                            100.0,
                            900.0,
                            750.0
                        ],
                        "boxes": [
                            {
                                "box": {
                                    "id": "title_comment",
                                    "maxclass": "comment",
                                    "numinlets": 1,
                                    "numoutlets": 0,
                                    "patching_rect": [
                                        20.0,
                                        10.0,
                                        500.0,
                                        20.0
                                    ],
                                    "text": "=== LOOP BUS: urban \u2014 double-buffered crossfade loop playback ==="
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
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        20.0,
                                        50.0,
                                        30.0,
                                        30.0
                                    ]
                                }
                            },
                            {
                                "box": {
                                    "id": "vol_pack",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        20.0,
                                        90.0,
                                        70.0,
                                        22.0
                                    ],
                                    "text": "pack f 20"
                                }
                            },
                            {
                                "box": {
                                    "id": "vol_line",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "signal",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        20.0,
                                        120.0,
                                        55.0,
                                        22.0
                                    ],
                                    "text": "line~ 0."
                                }
                            },
                            {
                                "box": {
                                    "id": "buffer_obj",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "float",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        600.0,
                                        50.0,
                                        150.0,
                                        22.0
                                    ],
                                    "text": "buffer~ loop_urban"
                                }
                            },
                            {
                                "box": {
                                    "id": "buf_loadmess",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        600.0,
                                        80.0,
                                        270.0,
                                        22.0
                                    ],
                                    "text": "loadmess replace /Users/halic/Installed/geo-sonification/sonification/samples/ambience/urban.wav"
                                }
                            },
                            {
                                "box": {
                                    "id": "info_obj",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 11,
                                    "outlettype": [
                                        "float",
                                        "list",
                                        "float",
                                        "float",
                                        "float",
                                        "float",
                                        "float",
                                        "float",
                                        "",
                                        "int",
                                        ""
                                    ],
                                    "patching_rect": [
                                        600.0,
                                        130.0,
                                        130.0,
                                        22.0
                                    ],
                                    "text": "info~ loop_urban"
                                }
                            },
                            {
                                "box": {
                                    "id": "send_buflen",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 0,
                                    "patching_rect": [
                                        600.0,
                                        160.0,
                                        130.0,
                                        22.0
                                    ],
                                    "text": "s geosoni_buflen"
                                }
                            },
                            {
                                "box": {
                                    "id": "recv_go",
                                    "maxclass": "newobj",
                                    "numinlets": 0,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        150.0,
                                        170.0,
                                        140.0,
                                        22.0
                                    ],
                                    "text": "r geosoni_loop_go"
                                }
                            },
                            {
                                "box": {
                                    "id": "msg_start",
                                    "maxclass": "message",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        150.0,
                                        200.0,
                                        85.0,
                                        22.0
                                    ],
                                    "text": "start_playing"
                                }
                            },
                            {
                                "box": {
                                    "id": "recv_xfade",
                                    "maxclass": "newobj",
                                    "numinlets": 0,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        280.0,
                                        170.0,
                                        120.0,
                                        22.0
                                    ],
                                    "text": "r geosoni_xfade"
                                }
                            },
                            {
                                "box": {
                                    "id": "msg_xfade",
                                    "maxclass": "message",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        280.0,
                                        200.0,
                                        45.0,
                                        22.0
                                    ],
                                    "text": "xfade"
                                }
                            },
                            {
                                "box": {
                                    "id": "recv_stop",
                                    "maxclass": "newobj",
                                    "numinlets": 0,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        420.0,
                                        170.0,
                                        140.0,
                                        22.0
                                    ],
                                    "text": "r geosoni_loop_stop"
                                }
                            },
                            {
                                "box": {
                                    "id": "msg_stop",
                                    "maxclass": "message",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        420.0,
                                        200.0,
                                        38.0,
                                        22.0
                                    ],
                                    "text": "stop"
                                }
                            },
                            {
                                "box": {
                                    "id": "js_voice",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 6,
                                    "outlettype": [
                                        "",
                                        "",
                                        "",
                                        "",
                                        "",
                                        ""
                                    ],
                                    "patching_rect": [
                                        150.0,
                                        240.0,
                                        400.0,
                                        22.0
                                    ],
                                    "text": "js loop_voice.js"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_a",
                                    "maxclass": "newobj",
                                    "numinlets": 3,
                                    "numoutlets": 3,
                                    "outlettype": [
                                        "signal",
                                        "signal",
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        340.0,
                                        150.0,
                                        22.0
                                    ],
                                    "text": "groove~ loop_urban 2"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_a_loopoff",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        310.0,
                                        90.0,
                                        22.0
                                    ],
                                    "text": "loadmess loop 0"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_b",
                                    "maxclass": "newobj",
                                    "numinlets": 3,
                                    "numoutlets": 3,
                                    "outlettype": [
                                        "signal",
                                        "signal",
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        340.0,
                                        150.0,
                                        22.0
                                    ],
                                    "text": "groove~ loop_urban 2"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_b_loopoff",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        310.0,
                                        90.0,
                                        22.0
                                    ],
                                    "text": "loadmess loop 0"
                                }
                            },
                            {
                                "box": {
                                    "id": "fade_line_a",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "signal",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        220.0,
                                        380.0,
                                        55.0,
                                        22.0
                                    ],
                                    "text": "line~ 0."
                                }
                            },
                            {
                                "box": {
                                    "id": "fade_line_b",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "signal",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        570.0,
                                        380.0,
                                        55.0,
                                        22.0
                                    ],
                                    "text": "line~ 0."
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_a_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_a_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        130.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_b_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_b_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        480.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "sum_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        470.0,
                                        370.0,
                                        22.0
                                    ],
                                    "text": "+~"
                                }
                            },
                            {
                                "box": {
                                    "id": "sum_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        130.0,
                                        500.0,
                                        370.0,
                                        22.0
                                    ],
                                    "text": "+~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_vol_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        540.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_vol_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        130.0,
                                        540.0,
                                        40.0,
                                        22.0
                                    ],
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
                                    "patching_rect": [
                                        50.0,
                                        590.0,
                                        30.0,
                                        30.0
                                    ]
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
                                    "patching_rect": [
                                        130.0,
                                        590.0,
                                        30.0,
                                        30.0
                                    ]
                                }
                            },
                            {
                                "box": {
                                    "id": "sig_speed_a",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        280.0,
                                        45.0,
                                        22.0
                                    ],
                                    "text": "sig~ 1."
                                }
                            },
                            {
                                "box": {
                                    "id": "sig_speed_b",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        280.0,
                                        45.0,
                                        22.0
                                    ],
                                    "text": "sig~ 1."
                                }
                            }
                        ],
                        "lines": [
                            {
                                "patchline": {
                                    "source": [
                                        "vol_inlet",
                                        0
                                    ],
                                    "destination": [
                                        "vol_pack",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "vol_pack",
                                        0
                                    ],
                                    "destination": [
                                        "vol_line",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "buf_loadmess",
                                        0
                                    ],
                                    "destination": [
                                        "buffer_obj",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "buffer_obj",
                                        1
                                    ],
                                    "destination": [
                                        "info_obj",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "info_obj",
                                        6
                                    ],
                                    "destination": [
                                        "send_buflen",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "recv_go",
                                        0
                                    ],
                                    "destination": [
                                        "msg_start",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "msg_start",
                                        0
                                    ],
                                    "destination": [
                                        "js_voice",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "recv_xfade",
                                        0
                                    ],
                                    "destination": [
                                        "msg_xfade",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "msg_xfade",
                                        0
                                    ],
                                    "destination": [
                                        "js_voice",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "recv_stop",
                                        0
                                    ],
                                    "destination": [
                                        "msg_stop",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "msg_stop",
                                        0
                                    ],
                                    "destination": [
                                        "js_voice",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_a_loopoff",
                                        0
                                    ],
                                    "destination": [
                                        "groove_a",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_b_loopoff",
                                        0
                                    ],
                                    "destination": [
                                        "groove_b",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        1
                                    ],
                                    "destination": [
                                        "groove_a",
                                        1
                                    ],
                                    "midpoints": [
                                        229.5,
                                        270.0,
                                        125.0,
                                        270.0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        3
                                    ],
                                    "destination": [
                                        "groove_b",
                                        1
                                    ],
                                    "midpoints": [
                                        369.5,
                                        270.0,
                                        475.0,
                                        270.0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        4
                                    ],
                                    "destination": [
                                        "fade_line_a",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        5
                                    ],
                                    "destination": [
                                        "fade_line_b",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_a",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_a_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_a",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_a_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_a",
                                        1
                                    ],
                                    "destination": [
                                        "mul_fade_a_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_a",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_a_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_b",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_b_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_b",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_b_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_b",
                                        1
                                    ],
                                    "destination": [
                                        "mul_fade_b_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_b",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_b_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_a_L",
                                        0
                                    ],
                                    "destination": [
                                        "sum_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_b_L",
                                        0
                                    ],
                                    "destination": [
                                        "sum_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_a_R",
                                        0
                                    ],
                                    "destination": [
                                        "sum_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_b_R",
                                        0
                                    ],
                                    "destination": [
                                        "sum_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sum_L",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "vol_line",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sum_R",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "vol_line",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_vol_L",
                                        0
                                    ],
                                    "destination": [
                                        "out_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_vol_R",
                                        0
                                    ],
                                    "destination": [
                                        "out_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sig_speed_a",
                                        0
                                    ],
                                    "destination": [
                                        "groove_a",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sig_speed_b",
                                        0
                                    ],
                                    "destination": [
                                        "groove_b",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        0
                                    ],
                                    "destination": [
                                        "groove_a",
                                        0
                                    ],
                                    "midpoints": [
                                        159.5,
                                        270.0,
                                        59.5,
                                        270.0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        2
                                    ],
                                    "destination": [
                                        "groove_b",
                                        0
                                    ],
                                    "midpoints": [
                                        299.5,
                                        270.0,
                                        409.5,
                                        270.0
                                    ]
                                }
                            }
                        ]
                    }
                }
            },
            {
                "box": {
                    "id": "loop_bare",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "signal",
                        "signal"
                    ],
                    "patching_rect": [
                        620.0,
                        1880.0,
                        160.0,
                        22.0
                    ],
                    "text": "p loop_bus_bare",
                    "saved_object_attributes": {
                        "description": "",
                        "digest": "",
                        "globalpatchername": "",
                        "tags": ""
                    },
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
                        "rect": [
                            100.0,
                            100.0,
                            900.0,
                            750.0
                        ],
                        "boxes": [
                            {
                                "box": {
                                    "id": "title_comment",
                                    "maxclass": "comment",
                                    "numinlets": 1,
                                    "numoutlets": 0,
                                    "patching_rect": [
                                        20.0,
                                        10.0,
                                        500.0,
                                        20.0
                                    ],
                                    "text": "=== LOOP BUS: bare \u2014 double-buffered crossfade loop playback ==="
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
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        20.0,
                                        50.0,
                                        30.0,
                                        30.0
                                    ]
                                }
                            },
                            {
                                "box": {
                                    "id": "vol_pack",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        20.0,
                                        90.0,
                                        70.0,
                                        22.0
                                    ],
                                    "text": "pack f 20"
                                }
                            },
                            {
                                "box": {
                                    "id": "vol_line",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "signal",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        20.0,
                                        120.0,
                                        55.0,
                                        22.0
                                    ],
                                    "text": "line~ 0."
                                }
                            },
                            {
                                "box": {
                                    "id": "buffer_obj",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "float",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        600.0,
                                        50.0,
                                        150.0,
                                        22.0
                                    ],
                                    "text": "buffer~ loop_bare"
                                }
                            },
                            {
                                "box": {
                                    "id": "buf_loadmess",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        600.0,
                                        80.0,
                                        270.0,
                                        22.0
                                    ],
                                    "text": "loadmess replace /Users/halic/Installed/geo-sonification/sonification/samples/ambience/bare.wav"
                                }
                            },
                            {
                                "box": {
                                    "id": "info_obj",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 11,
                                    "outlettype": [
                                        "float",
                                        "list",
                                        "float",
                                        "float",
                                        "float",
                                        "float",
                                        "float",
                                        "float",
                                        "",
                                        "int",
                                        ""
                                    ],
                                    "patching_rect": [
                                        600.0,
                                        130.0,
                                        130.0,
                                        22.0
                                    ],
                                    "text": "info~ loop_bare"
                                }
                            },
                            {
                                "box": {
                                    "id": "send_buflen",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 0,
                                    "patching_rect": [
                                        600.0,
                                        160.0,
                                        130.0,
                                        22.0
                                    ],
                                    "text": "s geosoni_buflen"
                                }
                            },
                            {
                                "box": {
                                    "id": "recv_go",
                                    "maxclass": "newobj",
                                    "numinlets": 0,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        150.0,
                                        170.0,
                                        140.0,
                                        22.0
                                    ],
                                    "text": "r geosoni_loop_go"
                                }
                            },
                            {
                                "box": {
                                    "id": "msg_start",
                                    "maxclass": "message",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        150.0,
                                        200.0,
                                        85.0,
                                        22.0
                                    ],
                                    "text": "start_playing"
                                }
                            },
                            {
                                "box": {
                                    "id": "recv_xfade",
                                    "maxclass": "newobj",
                                    "numinlets": 0,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        280.0,
                                        170.0,
                                        120.0,
                                        22.0
                                    ],
                                    "text": "r geosoni_xfade"
                                }
                            },
                            {
                                "box": {
                                    "id": "msg_xfade",
                                    "maxclass": "message",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        280.0,
                                        200.0,
                                        45.0,
                                        22.0
                                    ],
                                    "text": "xfade"
                                }
                            },
                            {
                                "box": {
                                    "id": "recv_stop",
                                    "maxclass": "newobj",
                                    "numinlets": 0,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        420.0,
                                        170.0,
                                        140.0,
                                        22.0
                                    ],
                                    "text": "r geosoni_loop_stop"
                                }
                            },
                            {
                                "box": {
                                    "id": "msg_stop",
                                    "maxclass": "message",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        420.0,
                                        200.0,
                                        38.0,
                                        22.0
                                    ],
                                    "text": "stop"
                                }
                            },
                            {
                                "box": {
                                    "id": "js_voice",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 6,
                                    "outlettype": [
                                        "",
                                        "",
                                        "",
                                        "",
                                        "",
                                        ""
                                    ],
                                    "patching_rect": [
                                        150.0,
                                        240.0,
                                        400.0,
                                        22.0
                                    ],
                                    "text": "js loop_voice.js"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_a",
                                    "maxclass": "newobj",
                                    "numinlets": 3,
                                    "numoutlets": 3,
                                    "outlettype": [
                                        "signal",
                                        "signal",
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        340.0,
                                        150.0,
                                        22.0
                                    ],
                                    "text": "groove~ loop_bare 2"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_a_loopoff",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        310.0,
                                        90.0,
                                        22.0
                                    ],
                                    "text": "loadmess loop 0"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_b",
                                    "maxclass": "newobj",
                                    "numinlets": 3,
                                    "numoutlets": 3,
                                    "outlettype": [
                                        "signal",
                                        "signal",
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        340.0,
                                        150.0,
                                        22.0
                                    ],
                                    "text": "groove~ loop_bare 2"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_b_loopoff",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        310.0,
                                        90.0,
                                        22.0
                                    ],
                                    "text": "loadmess loop 0"
                                }
                            },
                            {
                                "box": {
                                    "id": "fade_line_a",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "signal",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        220.0,
                                        380.0,
                                        55.0,
                                        22.0
                                    ],
                                    "text": "line~ 0."
                                }
                            },
                            {
                                "box": {
                                    "id": "fade_line_b",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "signal",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        570.0,
                                        380.0,
                                        55.0,
                                        22.0
                                    ],
                                    "text": "line~ 0."
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_a_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_a_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        130.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_b_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_b_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        480.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "sum_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        470.0,
                                        370.0,
                                        22.0
                                    ],
                                    "text": "+~"
                                }
                            },
                            {
                                "box": {
                                    "id": "sum_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        130.0,
                                        500.0,
                                        370.0,
                                        22.0
                                    ],
                                    "text": "+~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_vol_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        540.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_vol_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        130.0,
                                        540.0,
                                        40.0,
                                        22.0
                                    ],
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
                                    "patching_rect": [
                                        50.0,
                                        590.0,
                                        30.0,
                                        30.0
                                    ]
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
                                    "patching_rect": [
                                        130.0,
                                        590.0,
                                        30.0,
                                        30.0
                                    ]
                                }
                            },
                            {
                                "box": {
                                    "id": "sig_speed_a",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        280.0,
                                        45.0,
                                        22.0
                                    ],
                                    "text": "sig~ 1."
                                }
                            },
                            {
                                "box": {
                                    "id": "sig_speed_b",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        280.0,
                                        45.0,
                                        22.0
                                    ],
                                    "text": "sig~ 1."
                                }
                            }
                        ],
                        "lines": [
                            {
                                "patchline": {
                                    "source": [
                                        "vol_inlet",
                                        0
                                    ],
                                    "destination": [
                                        "vol_pack",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "vol_pack",
                                        0
                                    ],
                                    "destination": [
                                        "vol_line",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "buf_loadmess",
                                        0
                                    ],
                                    "destination": [
                                        "buffer_obj",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "buffer_obj",
                                        1
                                    ],
                                    "destination": [
                                        "info_obj",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "info_obj",
                                        6
                                    ],
                                    "destination": [
                                        "send_buflen",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "recv_go",
                                        0
                                    ],
                                    "destination": [
                                        "msg_start",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "msg_start",
                                        0
                                    ],
                                    "destination": [
                                        "js_voice",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "recv_xfade",
                                        0
                                    ],
                                    "destination": [
                                        "msg_xfade",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "msg_xfade",
                                        0
                                    ],
                                    "destination": [
                                        "js_voice",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "recv_stop",
                                        0
                                    ],
                                    "destination": [
                                        "msg_stop",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "msg_stop",
                                        0
                                    ],
                                    "destination": [
                                        "js_voice",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_a_loopoff",
                                        0
                                    ],
                                    "destination": [
                                        "groove_a",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_b_loopoff",
                                        0
                                    ],
                                    "destination": [
                                        "groove_b",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        1
                                    ],
                                    "destination": [
                                        "groove_a",
                                        1
                                    ],
                                    "midpoints": [
                                        229.5,
                                        270.0,
                                        125.0,
                                        270.0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        3
                                    ],
                                    "destination": [
                                        "groove_b",
                                        1
                                    ],
                                    "midpoints": [
                                        369.5,
                                        270.0,
                                        475.0,
                                        270.0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        4
                                    ],
                                    "destination": [
                                        "fade_line_a",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        5
                                    ],
                                    "destination": [
                                        "fade_line_b",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_a",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_a_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_a",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_a_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_a",
                                        1
                                    ],
                                    "destination": [
                                        "mul_fade_a_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_a",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_a_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_b",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_b_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_b",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_b_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_b",
                                        1
                                    ],
                                    "destination": [
                                        "mul_fade_b_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_b",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_b_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_a_L",
                                        0
                                    ],
                                    "destination": [
                                        "sum_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_b_L",
                                        0
                                    ],
                                    "destination": [
                                        "sum_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_a_R",
                                        0
                                    ],
                                    "destination": [
                                        "sum_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_b_R",
                                        0
                                    ],
                                    "destination": [
                                        "sum_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sum_L",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "vol_line",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sum_R",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "vol_line",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_vol_L",
                                        0
                                    ],
                                    "destination": [
                                        "out_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_vol_R",
                                        0
                                    ],
                                    "destination": [
                                        "out_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sig_speed_a",
                                        0
                                    ],
                                    "destination": [
                                        "groove_a",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sig_speed_b",
                                        0
                                    ],
                                    "destination": [
                                        "groove_b",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        0
                                    ],
                                    "destination": [
                                        "groove_a",
                                        0
                                    ],
                                    "midpoints": [
                                        159.5,
                                        270.0,
                                        59.5,
                                        270.0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        2
                                    ],
                                    "destination": [
                                        "groove_b",
                                        0
                                    ],
                                    "midpoints": [
                                        299.5,
                                        270.0,
                                        409.5,
                                        270.0
                                    ]
                                }
                            }
                        ]
                    }
                }
            },
            {
                "box": {
                    "id": "loop_water",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "signal",
                        "signal"
                    ],
                    "patching_rect": [
                        820.0,
                        1880.0,
                        160.0,
                        22.0
                    ],
                    "text": "p loop_bus_water",
                    "saved_object_attributes": {
                        "description": "",
                        "digest": "",
                        "globalpatchername": "",
                        "tags": ""
                    },
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
                        "rect": [
                            100.0,
                            100.0,
                            900.0,
                            750.0
                        ],
                        "boxes": [
                            {
                                "box": {
                                    "id": "title_comment",
                                    "maxclass": "comment",
                                    "numinlets": 1,
                                    "numoutlets": 0,
                                    "patching_rect": [
                                        20.0,
                                        10.0,
                                        500.0,
                                        20.0
                                    ],
                                    "text": "=== LOOP BUS: water \u2014 double-buffered crossfade loop playback ==="
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
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        20.0,
                                        50.0,
                                        30.0,
                                        30.0
                                    ]
                                }
                            },
                            {
                                "box": {
                                    "id": "vol_pack",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        20.0,
                                        90.0,
                                        70.0,
                                        22.0
                                    ],
                                    "text": "pack f 20"
                                }
                            },
                            {
                                "box": {
                                    "id": "vol_line",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "signal",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        20.0,
                                        120.0,
                                        55.0,
                                        22.0
                                    ],
                                    "text": "line~ 0."
                                }
                            },
                            {
                                "box": {
                                    "id": "buffer_obj",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "float",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        600.0,
                                        50.0,
                                        150.0,
                                        22.0
                                    ],
                                    "text": "buffer~ loop_water"
                                }
                            },
                            {
                                "box": {
                                    "id": "buf_loadmess",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        600.0,
                                        80.0,
                                        270.0,
                                        22.0
                                    ],
                                    "text": "loadmess replace /Users/halic/Installed/geo-sonification/sonification/samples/ambience/water.wav"
                                }
                            },
                            {
                                "box": {
                                    "id": "info_obj",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 11,
                                    "outlettype": [
                                        "float",
                                        "list",
                                        "float",
                                        "float",
                                        "float",
                                        "float",
                                        "float",
                                        "float",
                                        "",
                                        "int",
                                        ""
                                    ],
                                    "patching_rect": [
                                        600.0,
                                        130.0,
                                        130.0,
                                        22.0
                                    ],
                                    "text": "info~ loop_water"
                                }
                            },
                            {
                                "box": {
                                    "id": "send_buflen",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 0,
                                    "patching_rect": [
                                        600.0,
                                        160.0,
                                        130.0,
                                        22.0
                                    ],
                                    "text": "s geosoni_buflen"
                                }
                            },
                            {
                                "box": {
                                    "id": "recv_go",
                                    "maxclass": "newobj",
                                    "numinlets": 0,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        150.0,
                                        170.0,
                                        140.0,
                                        22.0
                                    ],
                                    "text": "r geosoni_loop_go"
                                }
                            },
                            {
                                "box": {
                                    "id": "msg_start",
                                    "maxclass": "message",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        150.0,
                                        200.0,
                                        85.0,
                                        22.0
                                    ],
                                    "text": "start_playing"
                                }
                            },
                            {
                                "box": {
                                    "id": "recv_xfade",
                                    "maxclass": "newobj",
                                    "numinlets": 0,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        280.0,
                                        170.0,
                                        120.0,
                                        22.0
                                    ],
                                    "text": "r geosoni_xfade"
                                }
                            },
                            {
                                "box": {
                                    "id": "msg_xfade",
                                    "maxclass": "message",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        280.0,
                                        200.0,
                                        45.0,
                                        22.0
                                    ],
                                    "text": "xfade"
                                }
                            },
                            {
                                "box": {
                                    "id": "recv_stop",
                                    "maxclass": "newobj",
                                    "numinlets": 0,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        420.0,
                                        170.0,
                                        140.0,
                                        22.0
                                    ],
                                    "text": "r geosoni_loop_stop"
                                }
                            },
                            {
                                "box": {
                                    "id": "msg_stop",
                                    "maxclass": "message",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        420.0,
                                        200.0,
                                        38.0,
                                        22.0
                                    ],
                                    "text": "stop"
                                }
                            },
                            {
                                "box": {
                                    "id": "js_voice",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 6,
                                    "outlettype": [
                                        "",
                                        "",
                                        "",
                                        "",
                                        "",
                                        ""
                                    ],
                                    "patching_rect": [
                                        150.0,
                                        240.0,
                                        400.0,
                                        22.0
                                    ],
                                    "text": "js loop_voice.js"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_a",
                                    "maxclass": "newobj",
                                    "numinlets": 3,
                                    "numoutlets": 3,
                                    "outlettype": [
                                        "signal",
                                        "signal",
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        340.0,
                                        150.0,
                                        22.0
                                    ],
                                    "text": "groove~ loop_water 2"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_a_loopoff",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        310.0,
                                        90.0,
                                        22.0
                                    ],
                                    "text": "loadmess loop 0"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_b",
                                    "maxclass": "newobj",
                                    "numinlets": 3,
                                    "numoutlets": 3,
                                    "outlettype": [
                                        "signal",
                                        "signal",
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        340.0,
                                        150.0,
                                        22.0
                                    ],
                                    "text": "groove~ loop_water 2"
                                }
                            },
                            {
                                "box": {
                                    "id": "groove_b_loopoff",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        ""
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        310.0,
                                        90.0,
                                        22.0
                                    ],
                                    "text": "loadmess loop 0"
                                }
                            },
                            {
                                "box": {
                                    "id": "fade_line_a",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "signal",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        220.0,
                                        380.0,
                                        55.0,
                                        22.0
                                    ],
                                    "text": "line~ 0."
                                }
                            },
                            {
                                "box": {
                                    "id": "fade_line_b",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 2,
                                    "outlettype": [
                                        "signal",
                                        "bang"
                                    ],
                                    "patching_rect": [
                                        570.0,
                                        380.0,
                                        55.0,
                                        22.0
                                    ],
                                    "text": "line~ 0."
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_a_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_a_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        130.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_b_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_fade_b_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        480.0,
                                        420.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "sum_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        470.0,
                                        370.0,
                                        22.0
                                    ],
                                    "text": "+~"
                                }
                            },
                            {
                                "box": {
                                    "id": "sum_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        130.0,
                                        500.0,
                                        370.0,
                                        22.0
                                    ],
                                    "text": "+~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_vol_L",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        540.0,
                                        40.0,
                                        22.0
                                    ],
                                    "text": "*~"
                                }
                            },
                            {
                                "box": {
                                    "id": "mul_vol_R",
                                    "maxclass": "newobj",
                                    "numinlets": 2,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        130.0,
                                        540.0,
                                        40.0,
                                        22.0
                                    ],
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
                                    "patching_rect": [
                                        50.0,
                                        590.0,
                                        30.0,
                                        30.0
                                    ]
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
                                    "patching_rect": [
                                        130.0,
                                        590.0,
                                        30.0,
                                        30.0
                                    ]
                                }
                            },
                            {
                                "box": {
                                    "id": "sig_speed_a",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        50.0,
                                        280.0,
                                        45.0,
                                        22.0
                                    ],
                                    "text": "sig~ 1."
                                }
                            },
                            {
                                "box": {
                                    "id": "sig_speed_b",
                                    "maxclass": "newobj",
                                    "numinlets": 1,
                                    "numoutlets": 1,
                                    "outlettype": [
                                        "signal"
                                    ],
                                    "patching_rect": [
                                        400.0,
                                        280.0,
                                        45.0,
                                        22.0
                                    ],
                                    "text": "sig~ 1."
                                }
                            }
                        ],
                        "lines": [
                            {
                                "patchline": {
                                    "source": [
                                        "vol_inlet",
                                        0
                                    ],
                                    "destination": [
                                        "vol_pack",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "vol_pack",
                                        0
                                    ],
                                    "destination": [
                                        "vol_line",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "buf_loadmess",
                                        0
                                    ],
                                    "destination": [
                                        "buffer_obj",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "buffer_obj",
                                        1
                                    ],
                                    "destination": [
                                        "info_obj",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "info_obj",
                                        6
                                    ],
                                    "destination": [
                                        "send_buflen",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "recv_go",
                                        0
                                    ],
                                    "destination": [
                                        "msg_start",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "msg_start",
                                        0
                                    ],
                                    "destination": [
                                        "js_voice",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "recv_xfade",
                                        0
                                    ],
                                    "destination": [
                                        "msg_xfade",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "msg_xfade",
                                        0
                                    ],
                                    "destination": [
                                        "js_voice",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "recv_stop",
                                        0
                                    ],
                                    "destination": [
                                        "msg_stop",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "msg_stop",
                                        0
                                    ],
                                    "destination": [
                                        "js_voice",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_a_loopoff",
                                        0
                                    ],
                                    "destination": [
                                        "groove_a",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_b_loopoff",
                                        0
                                    ],
                                    "destination": [
                                        "groove_b",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        1
                                    ],
                                    "destination": [
                                        "groove_a",
                                        1
                                    ],
                                    "midpoints": [
                                        229.5,
                                        270.0,
                                        125.0,
                                        270.0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        3
                                    ],
                                    "destination": [
                                        "groove_b",
                                        1
                                    ],
                                    "midpoints": [
                                        369.5,
                                        270.0,
                                        475.0,
                                        270.0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        4
                                    ],
                                    "destination": [
                                        "fade_line_a",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        5
                                    ],
                                    "destination": [
                                        "fade_line_b",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_a",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_a_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_a",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_a_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_a",
                                        1
                                    ],
                                    "destination": [
                                        "mul_fade_a_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_a",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_a_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_b",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_b_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_b",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_b_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "groove_b",
                                        1
                                    ],
                                    "destination": [
                                        "mul_fade_b_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "fade_line_b",
                                        0
                                    ],
                                    "destination": [
                                        "mul_fade_b_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_a_L",
                                        0
                                    ],
                                    "destination": [
                                        "sum_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_b_L",
                                        0
                                    ],
                                    "destination": [
                                        "sum_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_a_R",
                                        0
                                    ],
                                    "destination": [
                                        "sum_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_fade_b_R",
                                        0
                                    ],
                                    "destination": [
                                        "sum_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sum_L",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "vol_line",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_L",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sum_R",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "vol_line",
                                        0
                                    ],
                                    "destination": [
                                        "mul_vol_R",
                                        1
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_vol_L",
                                        0
                                    ],
                                    "destination": [
                                        "out_L",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "mul_vol_R",
                                        0
                                    ],
                                    "destination": [
                                        "out_R",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sig_speed_a",
                                        0
                                    ],
                                    "destination": [
                                        "groove_a",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "sig_speed_b",
                                        0
                                    ],
                                    "destination": [
                                        "groove_b",
                                        0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        0
                                    ],
                                    "destination": [
                                        "groove_a",
                                        0
                                    ],
                                    "midpoints": [
                                        159.5,
                                        270.0,
                                        59.5,
                                        270.0
                                    ]
                                }
                            },
                            {
                                "patchline": {
                                    "source": [
                                        "js_voice",
                                        2
                                    ],
                                    "destination": [
                                        "groove_b",
                                        0
                                    ],
                                    "midpoints": [
                                        299.5,
                                        270.0,
                                        409.5,
                                        270.0
                                    ]
                                }
                            }
                        ]
                    }
                }
            },
            {
                "box": {
                    "id": "lab_mix",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        1920.0,
                        400.0,
                        20.0
                    ],
                    "text": "--- STEREO MIX + MASTER TRIM ---"
                }
            },
            {
                "box": {
                    "id": "sum_L_1",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "signal"
                    ],
                    "patching_rect": [
                        20.0,
                        1950.0,
                        220.0,
                        22.0
                    ],
                    "text": "+~"
                }
            },
            {
                "box": {
                    "id": "sum_L_2",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "signal"
                    ],
                    "patching_rect": [
                        20.0,
                        1980.0,
                        420.0,
                        22.0
                    ],
                    "text": "+~"
                }
            },
            {
                "box": {
                    "id": "sum_L_3",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "signal"
                    ],
                    "patching_rect": [
                        20.0,
                        2010.0,
                        620.0,
                        22.0
                    ],
                    "text": "+~"
                }
            },
            {
                "box": {
                    "id": "sum_L_4",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "signal"
                    ],
                    "patching_rect": [
                        20.0,
                        2040.0,
                        820.0,
                        22.0
                    ],
                    "text": "+~"
                }
            },
            {
                "box": {
                    "id": "sum_R_1",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "signal"
                    ],
                    "patching_rect": [
                        100.0,
                        1950.0,
                        220.0,
                        22.0
                    ],
                    "text": "+~"
                }
            },
            {
                "box": {
                    "id": "sum_R_2",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "signal"
                    ],
                    "patching_rect": [
                        100.0,
                        1980.0,
                        420.0,
                        22.0
                    ],
                    "text": "+~"
                }
            },
            {
                "box": {
                    "id": "sum_R_3",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "signal"
                    ],
                    "patching_rect": [
                        100.0,
                        2010.0,
                        620.0,
                        22.0
                    ],
                    "text": "+~"
                }
            },
            {
                "box": {
                    "id": "sum_R_4",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "signal"
                    ],
                    "patching_rect": [
                        100.0,
                        2040.0,
                        820.0,
                        22.0
                    ],
                    "text": "+~"
                }
            },
            {
                "box": {
                    "id": "trim_L",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "signal"
                    ],
                    "patching_rect": [
                        20.0,
                        2080.0,
                        60.0,
                        22.0
                    ],
                    "text": "*~ 0.2"
                }
            },
            {
                "box": {
                    "id": "trim_R",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "signal"
                    ],
                    "patching_rect": [
                        100.0,
                        2080.0,
                        60.0,
                        22.0
                    ],
                    "text": "*~ 0.2"
                }
            },
            {
                "box": {
                    "id": "dac",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        2120.0,
                        100.0,
                        22.0
                    ],
                    "text": "dac~ 1 2"
                }
            },
            {
                "box": {
                    "id": "send_prox",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20.0,
                        900.0,
                        130.0,
                        22.0
                    ],
                    "text": "send geosoni_prox"
                }
            },
            {
                "box": {
                    "id": "recv_prox_cf",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [
                        ""
                    ],
                    "patching_rect": [
                        1010.0,
                        1025.0,
                        140.0,
                        22.0
                    ],
                    "text": "receive geosoni_prox"
                }
            },
            {
                "box": {
                    "id": "recv_prox_it",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [
                        ""
                    ],
                    "patching_rect": [
                        1010.0,
                        1385.0,
                        140.0,
                        22.0
                    ],
                    "text": "receive geosoni_prox"
                }
            },
            {
                "box": {
                    "id": "recv_prox_wb",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [
                        ""
                    ],
                    "patching_rect": [
                        619.0,
                        1162.0,
                        140.0,
                        22.0
                    ],
                    "text": "receive geosoni_prox"
                }
            },
            {
                "box": {
                    "id": "send_cov",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        820.0,
                        900.0,
                        120.0,
                        22.0
                    ],
                    "text": "send geosoni_cov"
                }
            },
            {
                "box": {
                    "id": "recv_cov_wb",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [
                        ""
                    ],
                    "patching_rect": [
                        769.0,
                        1186.0,
                        130.0,
                        22.0
                    ],
                    "text": "receive geosoni_cov"
                }
            }
        ],
        "lines": [
            {
                "patchline": {
                    "destination": [
                        "print_grid_data",
                        0
                    ],
                    "source": [
                        "grid_data_route",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "print_grid_lc",
                        0
                    ],
                    "source": [
                        "grid_lc_unpack",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "print_grid_pos",
                        0
                    ],
                    "source": [
                        "grid_pos_unpack",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_bare_bus",
                        0
                    ],
                    "source": [
                        "js_crossfade",
                        5
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_crop_bus",
                        0
                    ],
                    "source": [
                        "js_crossfade",
                        3
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_urban_bus",
                        0
                    ],
                    "source": [
                        "js_crossfade",
                        4
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "tree_add1",
                        1
                    ],
                    "source": [
                        "js_crossfade",
                        1
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "tree_add1",
                        0
                    ],
                    "source": [
                        "js_crossfade",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "tree_add2",
                        1
                    ],
                    "source": [
                        "js_crossfade",
                        2
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "tree_add3",
                        1
                    ],
                    "source": [
                        "js_crossfade",
                        9
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "tree_add3",
                        0
                    ],
                    "source": [
                        "js_crossfade",
                        8
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "tree_add4",
                        1
                    ],
                    "source": [
                        "js_crossfade",
                        10
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "water_add1",
                        1
                    ],
                    "source": [
                        "js_crossfade",
                        7
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "water_add1",
                        0
                    ],
                    "source": [
                        "js_crossfade",
                        6
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_icon_int",
                        0
                    ],
                    "source": [
                        "js_icontrig",
                        1
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "num_icon_cat",
                        0
                    ],
                    "source": [
                        "js_icontrig",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "water_max",
                        1
                    ],
                    "source": [
                        "js_water_bus",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        12
                    ],
                    "source": [
                        "metro_icon",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_water_bus",
                        1
                    ],
                    "source": [
                        "recv_cov_wb",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        11
                    ],
                    "source": [
                        "recv_prox_cf",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        11
                    ],
                    "source": [
                        "recv_prox_it",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_water_bus",
                        0
                    ],
                    "source": [
                        "recv_prox_wb",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "grid_data_route",
                        0
                    ],
                    "source": [
                        "route_grid",
                        3
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "grid_lc_unpack",
                        0
                    ],
                    "source": [
                        "route_grid",
                        2
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "grid_pos_unpack",
                        0
                    ],
                    "source": [
                        "route_grid",
                        1
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "print_gridcount",
                        0
                    ],
                    "source": [
                        "route_grid",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "print_viewport",
                        0
                    ],
                    "source": [
                        "route_grid",
                        4
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_lc10",
                        0
                    ],
                    "source": [
                        "route_lc",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_lc100",
                        0
                    ],
                    "source": [
                        "route_lc",
                        10
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_lc20",
                        0
                    ],
                    "source": [
                        "route_lc",
                        1
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_lc30",
                        0
                    ],
                    "source": [
                        "route_lc",
                        2
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_lc40",
                        0
                    ],
                    "source": [
                        "route_lc",
                        3
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_lc50",
                        0
                    ],
                    "source": [
                        "route_lc",
                        4
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_lc60",
                        0
                    ],
                    "source": [
                        "route_lc",
                        5
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_lc70",
                        0
                    ],
                    "source": [
                        "route_lc",
                        6
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_lc80",
                        0
                    ],
                    "source": [
                        "route_lc",
                        7
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_lc90",
                        0
                    ],
                    "source": [
                        "route_lc",
                        8
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_lc95",
                        0
                    ],
                    "source": [
                        "route_lc",
                        9
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_forest",
                        0
                    ],
                    "source": [
                        "route_osc",
                        3
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_landcover",
                        0
                    ],
                    "source": [
                        "route_osc",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_nightlight",
                        0
                    ],
                    "source": [
                        "route_osc",
                        1
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_population",
                        0
                    ],
                    "source": [
                        "route_osc",
                        2
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_coverage",
                        0
                    ],
                    "source": [
                        "route_signals",
                        2
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "t_proximity",
                        0
                    ],
                    "source": [
                        "route_signals",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_coverage",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_coverage",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "send_cov",
                        0
                    ],
                    "order": 1,
                    "source": [
                        "t_coverage",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_forest",
                        0
                    ],
                    "order": 1,
                    "source": [
                        "t_forest",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "out_forest",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_forest",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "num_landcover",
                        0
                    ],
                    "order": 1,
                    "source": [
                        "t_landcover",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "out_landcover",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_landcover",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_lc10",
                        0
                    ],
                    "order": 3,
                    "source": [
                        "t_lc10",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        0
                    ],
                    "order": 2,
                    "source": [
                        "t_lc10",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        0
                    ],
                    "order": 1,
                    "source": [
                        "t_lc10",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "out_lc10",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_lc10",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_lc100",
                        0
                    ],
                    "order": 1,
                    "source": [
                        "t_lc100",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        10
                    ],
                    "order": 3,
                    "source": [
                        "t_lc100",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        10
                    ],
                    "order": 2,
                    "source": [
                        "t_lc100",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "out_lc100",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_lc100",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_lc20",
                        0
                    ],
                    "order": 3,
                    "source": [
                        "t_lc20",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        1
                    ],
                    "order": 2,
                    "source": [
                        "t_lc20",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        1
                    ],
                    "order": 1,
                    "source": [
                        "t_lc20",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "out_lc20",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_lc20",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_lc30",
                        0
                    ],
                    "order": 3,
                    "source": [
                        "t_lc30",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        2
                    ],
                    "order": 2,
                    "source": [
                        "t_lc30",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        2
                    ],
                    "order": 1,
                    "source": [
                        "t_lc30",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "out_lc30",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_lc30",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_lc40",
                        0
                    ],
                    "order": 3,
                    "source": [
                        "t_lc40",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        3
                    ],
                    "order": 2,
                    "source": [
                        "t_lc40",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        3
                    ],
                    "order": 1,
                    "source": [
                        "t_lc40",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "out_lc40",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_lc40",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_lc50",
                        0
                    ],
                    "order": 2,
                    "source": [
                        "t_lc50",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        4
                    ],
                    "order": 3,
                    "source": [
                        "t_lc50",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        4
                    ],
                    "order": 1,
                    "source": [
                        "t_lc50",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "out_lc50",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_lc50",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_lc60",
                        0
                    ],
                    "order": 1,
                    "source": [
                        "t_lc60",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        5
                    ],
                    "order": 3,
                    "source": [
                        "t_lc60",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        5
                    ],
                    "order": 2,
                    "source": [
                        "t_lc60",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "out_lc60",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_lc60",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_lc70",
                        0
                    ],
                    "order": 1,
                    "source": [
                        "t_lc70",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        6
                    ],
                    "order": 3,
                    "source": [
                        "t_lc70",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        6
                    ],
                    "order": 2,
                    "source": [
                        "t_lc70",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "out_lc70",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_lc70",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_lc80",
                        0
                    ],
                    "order": 1,
                    "source": [
                        "t_lc80",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        7
                    ],
                    "order": 3,
                    "source": [
                        "t_lc80",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        7
                    ],
                    "order": 2,
                    "source": [
                        "t_lc80",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "out_lc80",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_lc80",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_lc90",
                        0
                    ],
                    "order": 1,
                    "source": [
                        "t_lc90",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        8
                    ],
                    "order": 3,
                    "source": [
                        "t_lc90",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        8
                    ],
                    "order": 2,
                    "source": [
                        "t_lc90",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "out_lc90",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_lc90",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_lc95",
                        0
                    ],
                    "order": 1,
                    "source": [
                        "t_lc95",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        9
                    ],
                    "order": 3,
                    "source": [
                        "t_lc95",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        9
                    ],
                    "order": 2,
                    "source": [
                        "t_lc95",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "out_lc95",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_lc95",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_nightlight",
                        0
                    ],
                    "order": 1,
                    "source": [
                        "t_nightlight",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "out_nightlight",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_nightlight",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_population",
                        0
                    ],
                    "order": 1,
                    "source": [
                        "t_population",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "out_population",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_population",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_proximity",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "t_proximity",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "send_prox",
                        0
                    ],
                    "order": 1,
                    "source": [
                        "t_proximity",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "metro_icon",
                        0
                    ],
                    "source": [
                        "toggle_icon",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "tree_add2",
                        0
                    ],
                    "source": [
                        "tree_add1",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "tree_add5",
                        0
                    ],
                    "source": [
                        "tree_add2",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "tree_add4",
                        0
                    ],
                    "source": [
                        "tree_add3",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "tree_add5",
                        1
                    ],
                    "source": [
                        "tree_add4",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_tree_bus",
                        0
                    ],
                    "source": [
                        "tree_add5",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "route_grid",
                        0
                    ],
                    "order": 1,
                    "source": [
                        "udp_recv",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "route_lc",
                        0
                    ],
                    "order": 2,
                    "source": [
                        "udp_recv",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "route_osc",
                        0
                    ],
                    "order": 3,
                    "source": [
                        "udp_recv",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "route_signals",
                        0
                    ],
                    "order": 0,
                    "source": [
                        "udp_recv",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "water_max",
                        0
                    ],
                    "source": [
                        "water_add1",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_water_bus",
                        0
                    ],
                    "source": [
                        "water_max",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "dsp_toggle",
                        0
                    ],
                    "destination": [
                        "dsp_sel",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "dsp_sel",
                        0
                    ],
                    "destination": [
                        "on_trigger",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "dsp_sel",
                        1
                    ],
                    "destination": [
                        "off_trigger",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "on_trigger",
                        1
                    ],
                    "destination": [
                        "dsp_on_msg",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "on_trigger",
                        0
                    ],
                    "destination": [
                        "on_delay",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "on_delay",
                        0
                    ],
                    "destination": [
                        "clock_start_msg",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "clock_start_msg",
                        0
                    ],
                    "destination": [
                        "js_clock",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "off_trigger",
                        1
                    ],
                    "destination": [
                        "clock_stop_msg",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "clock_stop_msg",
                        0
                    ],
                    "destination": [
                        "js_clock",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "off_trigger",
                        0
                    ],
                    "destination": [
                        "off_delay",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "off_delay",
                        0
                    ],
                    "destination": [
                        "dsp_off_msg",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "js_clock",
                        0
                    ],
                    "destination": [
                        "clock_route",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "clock_route",
                        0
                    ],
                    "destination": [
                        "send_loop_go",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "clock_route",
                        1
                    ],
                    "destination": [
                        "send_xfade",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "clock_route",
                        2
                    ],
                    "destination": [
                        "send_loop_stop",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "recv_buflen",
                        0
                    ],
                    "destination": [
                        "prepend_buflen",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "prepend_buflen",
                        0
                    ],
                    "destination": [
                        "js_clock",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "flonum_tree_bus",
                        0
                    ],
                    "destination": [
                        "loop_tree",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "flonum_crop_bus",
                        0
                    ],
                    "destination": [
                        "loop_crop",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "flonum_urban_bus",
                        0
                    ],
                    "destination": [
                        "loop_urban",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "flonum_bare_bus",
                        0
                    ],
                    "destination": [
                        "loop_bare",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "flonum_water_bus",
                        0
                    ],
                    "destination": [
                        "loop_water",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "loop_tree",
                        0
                    ],
                    "destination": [
                        "sum_L_1",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "loop_crop",
                        0
                    ],
                    "destination": [
                        "sum_L_1",
                        1
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "sum_L_1",
                        0
                    ],
                    "destination": [
                        "sum_L_2",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "loop_urban",
                        0
                    ],
                    "destination": [
                        "sum_L_2",
                        1
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "sum_L_2",
                        0
                    ],
                    "destination": [
                        "sum_L_3",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "loop_bare",
                        0
                    ],
                    "destination": [
                        "sum_L_3",
                        1
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "sum_L_3",
                        0
                    ],
                    "destination": [
                        "sum_L_4",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "loop_water",
                        0
                    ],
                    "destination": [
                        "sum_L_4",
                        1
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "loop_tree",
                        1
                    ],
                    "destination": [
                        "sum_R_1",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "loop_crop",
                        1
                    ],
                    "destination": [
                        "sum_R_1",
                        1
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "sum_R_1",
                        0
                    ],
                    "destination": [
                        "sum_R_2",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "loop_urban",
                        1
                    ],
                    "destination": [
                        "sum_R_2",
                        1
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "sum_R_2",
                        0
                    ],
                    "destination": [
                        "sum_R_3",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "loop_bare",
                        1
                    ],
                    "destination": [
                        "sum_R_3",
                        1
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "sum_R_3",
                        0
                    ],
                    "destination": [
                        "sum_R_4",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "loop_water",
                        1
                    ],
                    "destination": [
                        "sum_R_4",
                        1
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "sum_L_4",
                        0
                    ],
                    "destination": [
                        "trim_L",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "sum_R_4",
                        0
                    ],
                    "destination": [
                        "trim_R",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "trim_L",
                        0
                    ],
                    "destination": [
                        "dac",
                        0
                    ]
                }
            },
            {
                "patchline": {
                    "source": [
                        "trim_R",
                        0
                    ],
                    "destination": [
                        "dac",
                        1
                    ]
                }
            }
        ],
        "autosave": 0
    }
}