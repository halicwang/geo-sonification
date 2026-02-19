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
            34,
            67,
            1300,
            1060
        ],
        "boxes": [
            {
                "box": {
                    "id": "title",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20,
                        15,
                        681,
                        20
                    ],
                    "text": "=== GEO-SONIFICATION: Data Hub (OSC → display + outlets). ==="
                }
            },
            {
                "box": {
                    "id": "osc_comment",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        20,
                        48,
                        599,
                        20
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
                        20,
                        72,
                        120,
                        22
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
                        20,
                        100,
                        320,
                        22
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
                        20,
                        138,
                        370,
                        20
                    ],
                    "text": "# landcover (int 10–100) ESA WorldCover class, dominant land type"
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
                        20,
                        160,
                        65,
                        22
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
                        220,
                        160,
                        60,
                        22
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
                        320,
                        160,
                        30,
                        22
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
                        20,
                        198,
                        286,
                        20
                    ],
                    "text": "# nightlight (float 0–1) normalized VIIRS, 0 = no light"
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
                        20,
                        220,
                        65,
                        22
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
                        220,
                        220,
                        60,
                        22
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
                        320,
                        220,
                        30,
                        22
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
                        20,
                        258,
                        323,
                        20
                    ],
                    "text": "# population (float 0–1) normalized density, 0 = uninhabited"
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
                        20,
                        280,
                        65,
                        22
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
                        220,
                        280,
                        60,
                        22
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
                        320,
                        280,
                        30,
                        22
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
                        20,
                        318,
                        280,
                        20
                    ],
                    "text": "# forest (float 0–1) forest % on land, 0 = no forest"
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
                        20,
                        340,
                        65,
                        22
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
                        220,
                        340,
                        60,
                        22
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
                        320,
                        340,
                        30,
                        22
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
                        20,
                        390,
                        700,
                        20
                    ],
                    "text": "--- LANDCOVER DISTRIBUTION: 11 classes, each float 0–1 area fraction. ---"
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
                        20,
                        418,
                        900,
                        22
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
                        20,
                        454,
                        100,
                        20
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
                        20,
                        476,
                        50,
                        22
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
                        20,
                        500,
                        60,
                        22
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
                        20,
                        526,
                        30,
                        22
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
                        110,
                        454,
                        70,
                        20
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
                        110,
                        476,
                        50,
                        22
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
                        110,
                        500,
                        60,
                        22
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
                        110,
                        526,
                        30,
                        22
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
                        200,
                        454,
                        70,
                        20
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
                        200,
                        476,
                        50,
                        22
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
                        200,
                        500,
                        60,
                        22
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
                        200,
                        526,
                        30,
                        22
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
                        290,
                        454,
                        70,
                        20
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
                        290,
                        476,
                        50,
                        22
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
                        290,
                        500,
                        60,
                        22
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
                        290,
                        526,
                        30,
                        22
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
                        380,
                        454,
                        70,
                        20
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
                        380,
                        476,
                        50,
                        22
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
                        380,
                        500,
                        60,
                        22
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
                        380,
                        526,
                        30,
                        22
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
                        470,
                        454,
                        70,
                        20
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
                        470,
                        476,
                        50,
                        22
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
                        470,
                        500,
                        60,
                        22
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
                        470,
                        526,
                        30,
                        22
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
                        560,
                        454,
                        70,
                        20
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
                        560,
                        476,
                        50,
                        22
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
                        560,
                        500,
                        60,
                        22
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
                        560,
                        526,
                        30,
                        22
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
                        650,
                        454,
                        70,
                        20
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
                        650,
                        476,
                        50,
                        22
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
                        650,
                        500,
                        60,
                        22
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
                        650,
                        526,
                        30,
                        22
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
                        740,
                        454,
                        70,
                        20
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
                        740,
                        476,
                        50,
                        22
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
                        740,
                        500,
                        60,
                        22
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
                        740,
                        526,
                        30,
                        22
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
                        830,
                        454,
                        70,
                        20
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
                        830,
                        476,
                        50,
                        22
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
                        830,
                        500,
                        60,
                        22
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
                        830,
                        526,
                        30,
                        22
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
                        920,
                        454,
                        70,
                        20
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
                        920,
                        476,
                        50,
                        22
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
                        920,
                        500,
                        60,
                        22
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
                        920,
                        526,
                        30,
                        22
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
                        20,
                        572,
                        700,
                        20
                    ],
                    "text": "--- PER-GRID MODE: individual cell data when zoomed in (threshold-based). ---"
                }
            },
            {
                "box": {
                    "id": "route_grid",
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
                        20,
                        600,
                        480,
                        22
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
                        20,
                        636,
                        100,
                        22
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
                        130,
                        636,
                        80,
                        22
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
                        130,
                        680,
                        100,
                        22
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
                        220,
                        636,
                        200,
                        22
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
                        240,
                        680,
                        100,
                        22
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
                        440,
                        636,
                        120,
                        22
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
                        440,
                        680,
                        100,
                        22
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
                        580,
                        636,
                        100,
                        22
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
                        20,
                        870,
                        460,
                        20
                    ],
                    "text": "--- VIEWPORT SIGNALS: /proximity, /delta/*, /coverage ---"
                }
            },
            {
                "box": {
                    "id": "route_signals",
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
                        20,
                        900,
                        480,
                        22
                    ],
                    "text": "route /proximity /delta/lc /delta/magnitude /delta/rate /coverage"
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
                        20,
                        940,
                        65,
                        22
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
                        90,
                        940,
                        60,
                        22
                    ]
                }
            },
            {
                "box": {
                    "id": "t_delta_mag",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        200,
                        940,
                        65,
                        22
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_delta_mag",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        270,
                        940,
                        60,
                        22
                    ]
                }
            },
            {
                "box": {
                    "id": "t_delta_rate",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        380,
                        940,
                        65,
                        22
                    ],
                    "text": "unpack f"
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_delta_rate",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        450,
                        940,
                        60,
                        22
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
                        560,
                        940,
                        65,
                        22
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
                        630,
                        940,
                        60,
                        22
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
                        20,
                        964,
                        80,
                        20
                    ],
                    "text": "proximity"
                }
            },
            {
                "box": {
                    "id": "lab_dmag",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        200,
                        964,
                        80,
                        20
                    ],
                    "text": "delta/mag"
                }
            },
            {
                "box": {
                    "id": "lab_drate",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        380,
                        964,
                        80,
                        20
                    ],
                    "text": "delta/rate"
                }
            },
            {
                "box": {
                    "id": "lab_cov",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        560,
                        964,
                        80,
                        20
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
                        20,
                        1000,
                        400,
                        20
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
                        20,
                        1030,
                        240,
                        22
                    ],
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
                        20,
                        1060,
                        440,
                        20
                    ],
                    "text": "--- FOLD-MAPPING: 11 ch → 4 buses (Tree / Urban / Bare / Water) ---"
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
                        20,
                        1080,
                        40,
                        22
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
                        20,
                        1110,
                        40,
                        22
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
                        20,
                        1140,
                        40,
                        22
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
                        20,
                        1170,
                        40,
                        22
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
                        20,
                        1200,
                        40,
                        22
                    ],
                    "text": "+ 0."
                }
            },
            {
                "box": {
                    "id": "tree_add6",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        20,
                        1230,
                        40,
                        22
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
                        20,
                        1260,
                        60,
                        22
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
                        90,
                        1262,
                        250,
                        20
                    ],
                    "text": "Tree bus (10,20,30,40,90,95,100)"
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
                        320,
                        1260,
                        60,
                        22
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
                        390,
                        1262,
                        120,
                        20
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
                        800,
                        1080,
                        40,
                        22
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
                        800,
                        1130,
                        150,
                        22
                    ],
                    "text": "js water_bus.js"
                }
            },
            {
                "box": {
                    "id": "water_max",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        800,
                        1200,
                        80,
                        22
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
                        560,
                        1260,
                        60,
                        22
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
                        630,
                        1262,
                        100,
                        20
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
                        800,
                        1260,
                        60,
                        22
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
                        870,
                        1262,
                        200,
                        20
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
                        20,
                        1300,
                        400,
                        20
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
                        20,
                        1330,
                        200,
                        22
                    ],
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
                        300,
                        1280,
                        20,
                        20
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
                        300,
                        1310,
                        70,
                        22
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
                        300,
                        1340,
                        160,
                        20
                    ],
                    "text": "metro → bang (inlet 12)"
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
                        20,
                        1380,
                        60,
                        22
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
                        100,
                        1380,
                        60,
                        22
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
                        20,
                        1404,
                        80,
                        20
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
                        100,
                        1404,
                        80,
                        20
                    ],
                    "text": "intensity"
                }
            },
            {
                "box": {
                    "id": "mul_delta_int",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [
                        "float"
                    ],
                    "patching_rect": [
                        200,
                        1380,
                        40,
                        22
                    ],
                    "text": "* 0."
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_drama_int",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [
                        "",
                        "bang"
                    ],
                    "parameter_enable": 0,
                    "patching_rect": [
                        200,
                        1420,
                        60,
                        22
                    ]
                }
            },
            {
                "box": {
                    "id": "lab_drama",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [
                        270,
                        1422,
                        170,
                        20
                    ],
                    "text": "intensity × delta/mag"
                }
            }
        ],
        "lines": [
            {
                "patchline": {
                    "destination": [
                        "route_osc",
                        0
                    ],
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
                    "source": [
                        "udp_recv",
                        0
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
                        "flonum_lc10",
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
                        "flonum_lc20",
                        0
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
                        "flonum_lc30",
                        0
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
                        "flonum_lc40",
                        0
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
                        "flonum_lc50",
                        0
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
                        "route_grid",
                        0
                    ],
                    "source": [
                        "udp_recv",
                        0
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
                        "route_signals",
                        0
                    ],
                    "source": [
                        "udp_recv",
                        0
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
                        "t_delta_mag",
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
                        "t_delta_rate",
                        0
                    ],
                    "source": [
                        "route_signals",
                        3
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
                        4
                    ]
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_proximity",
                        0
                    ],
                    "source": [
                        "t_proximity",
                        0
                    ],
                    "order": 0
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_delta_mag",
                        0
                    ],
                    "source": [
                        "t_delta_mag",
                        0
                    ],
                    "order": 0
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_delta_rate",
                        0
                    ],
                    "source": [
                        "t_delta_rate",
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
                    "source": [
                        "t_coverage",
                        0
                    ],
                    "order": 0
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_water_bus",
                        1
                    ],
                    "source": [
                        "t_coverage",
                        0
                    ],
                    "order": 1
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        0
                    ],
                    "source": [
                        "t_lc10",
                        0
                    ],
                    "order": 2
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        1
                    ],
                    "source": [
                        "t_lc20",
                        0
                    ],
                    "order": 2
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        2
                    ],
                    "source": [
                        "t_lc30",
                        0
                    ],
                    "order": 2
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        3
                    ],
                    "source": [
                        "t_lc40",
                        0
                    ],
                    "order": 2
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        4
                    ],
                    "source": [
                        "t_lc50",
                        0
                    ],
                    "order": 2
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        5
                    ],
                    "source": [
                        "t_lc60",
                        0
                    ],
                    "order": 2
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        6
                    ],
                    "source": [
                        "t_lc70",
                        0
                    ],
                    "order": 2
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        7
                    ],
                    "source": [
                        "t_lc80",
                        0
                    ],
                    "order": 2
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        8
                    ],
                    "source": [
                        "t_lc90",
                        0
                    ],
                    "order": 2
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        9
                    ],
                    "source": [
                        "t_lc95",
                        0
                    ],
                    "order": 2
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        10
                    ],
                    "source": [
                        "t_lc100",
                        0
                    ],
                    "order": 2
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_crossfade",
                        11
                    ],
                    "source": [
                        "t_proximity",
                        0
                    ],
                    "order": 1
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
                        "tree_add3",
                        1
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
                        "tree_add4",
                        1
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
                        "tree_add5",
                        0
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
                        "tree_add5",
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
                        "tree_add6",
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
                        "tree_add6",
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
                        "flonum_tree_bus",
                        0
                    ],
                    "source": [
                        "tree_add6",
                        0
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
                    "destination": [
                        "js_icontrig",
                        0
                    ],
                    "source": [
                        "t_lc10",
                        0
                    ],
                    "order": 3
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        1
                    ],
                    "source": [
                        "t_lc20",
                        0
                    ],
                    "order": 3
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        2
                    ],
                    "source": [
                        "t_lc30",
                        0
                    ],
                    "order": 3
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        3
                    ],
                    "source": [
                        "t_lc40",
                        0
                    ],
                    "order": 3
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        4
                    ],
                    "source": [
                        "t_lc50",
                        0
                    ],
                    "order": 3
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        5
                    ],
                    "source": [
                        "t_lc60",
                        0
                    ],
                    "order": 3
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        6
                    ],
                    "source": [
                        "t_lc70",
                        0
                    ],
                    "order": 3
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        7
                    ],
                    "source": [
                        "t_lc80",
                        0
                    ],
                    "order": 3
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        8
                    ],
                    "source": [
                        "t_lc90",
                        0
                    ],
                    "order": 3
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        9
                    ],
                    "source": [
                        "t_lc95",
                        0
                    ],
                    "order": 3
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        10
                    ],
                    "source": [
                        "t_lc100",
                        0
                    ],
                    "order": 3
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_icontrig",
                        11
                    ],
                    "source": [
                        "t_proximity",
                        0
                    ],
                    "order": 2
                }
            },
            {
                "patchline": {
                    "destination": [
                        "js_water_bus",
                        0
                    ],
                    "source": [
                        "t_proximity",
                        0
                    ],
                    "order": 3
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
                        "flonum_icon_int",
                        0
                    ],
                    "source": [
                        "js_icontrig",
                        1
                    ],
                    "order": 1
                }
            },
            {
                "patchline": {
                    "destination": [
                        "mul_delta_int",
                        0
                    ],
                    "source": [
                        "js_icontrig",
                        1
                    ],
                    "order": 0
                }
            },
            {
                "patchline": {
                    "destination": [
                        "mul_delta_int",
                        1
                    ],
                    "source": [
                        "t_delta_mag",
                        0
                    ],
                    "order": 1
                }
            },
            {
                "patchline": {
                    "destination": [
                        "flonum_drama_int",
                        0
                    ],
                    "source": [
                        "mul_delta_int",
                        0
                    ]
                }
            }
        ],
        "autosave": 0
    }
}
