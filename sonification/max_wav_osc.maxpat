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
        "rect": [ 34.0, 67.0, 1300.0, 1060.0 ],
        "boxes": [
            {
                "box": {
                    "id": "title",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 15.0, 681.0, 20.0 ],
                    "text": "=== GEO-SONIFICATION: Data Hub (OSC → display + outlets). ==="
                }
            },
            {
                "box": {
                    "id": "osc_comment",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 48.0, 599.0, 20.0 ],
                    "text": "--- OSC INPUT: Port 7400. 15 messages per viewport update. ---"
                }
            },
            {
                "box": {
                    "id": "udp_recv",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 20.0, 72.0, 120.0, 22.0 ],
                    "text": "udpreceive 7400"
                }
            },
            {
                "box": {
                    "id": "route_osc",
                    "maxclass": "newobj",
                    "numinlets": 5,
                    "numoutlets": 5,
                    "outlettype": [ "", "", "", "", "" ],
                    "patching_rect": [ 20.0, 100.0, 320.0, 22.0 ],
                    "text": "route /landcover /nightlight /population /forest"
                }
            },
            {
                "box": {
                    "id": "lab_landcover",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 138.0, 370.0, 20.0 ],
                    "text": "# landcover (int 10–100) ESA WorldCover class, dominant land type"
                }
            },
            {
                "box": {
                    "id": "t_landcover",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "int" ],
                    "patching_rect": [ 20.0, 160.0, 65.0, 22.0 ],
                    "text": "unpack i"
                }
            },
            {
                "box": {
                    "id": "num_landcover",
                    "maxclass": "number",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 220.0, 160.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 320.0, 160.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_nightlight",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 198.0, 286.0, 20.0 ],
                    "text": "# nightlight (float 0–1) normalized VIIRS, 0 = no light"
                }
            },
            {
                "box": {
                    "id": "t_nightlight",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 20.0, 220.0, 65.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 220.0, 220.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 320.0, 220.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_population",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 258.0, 323.0, 20.0 ],
                    "text": "# population (float 0–1) normalized density, 0 = uninhabited"
                }
            },
            {
                "box": {
                    "id": "t_population",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 20.0, 280.0, 65.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 220.0, 280.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 320.0, 280.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_forest",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 318.0, 280.0, 20.0 ],
                    "text": "# forest (float 0–1) forest % on land, 0 = no forest"
                }
            },
            {
                "box": {
                    "id": "t_forest",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 20.0, 340.0, 65.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 220.0, 340.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 320.0, 340.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc_section",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 390.0, 700.0, 20.0 ],
                    "text": "--- LANDCOVER DISTRIBUTION: 11 classes, each float 0–1 area fraction. ---"
                }
            },
            {
                "box": {
                    "id": "route_lc",
                    "maxclass": "newobj",
                    "numinlets": 12,
                    "numoutlets": 12,
                    "outlettype": [ "", "", "", "", "", "", "", "", "", "", "", "" ],
                    "patching_rect": [ 20.0, 418.0, 900.0, 22.0 ],
                    "text": "route /lc/10 /lc/20 /lc/30 /lc/40 /lc/50 /lc/60 /lc/70 /lc/80 /lc/90 /lc/95 /lc/100"
                }
            },
            {
                "box": {
                    "id": "lab_lc10",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 454.0, 100.0, 20.0 ],
                    "text": "Tree/Forest"
                }
            },
            {
                "box": {
                    "id": "t_lc10",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 20.0, 476.0, 50.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 20.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 20.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc20",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 110.0, 454.0, 70.0, 20.0 ],
                    "text": "Shrubland"
                }
            },
            {
                "box": {
                    "id": "t_lc20",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 110.0, 476.0, 50.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 110.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 110.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc30",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 200.0, 454.0, 70.0, 20.0 ],
                    "text": "Grassland"
                }
            },
            {
                "box": {
                    "id": "t_lc30",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 200.0, 476.0, 50.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 200.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 200.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc40",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 290.0, 454.0, 70.0, 20.0 ],
                    "text": "Cropland"
                }
            },
            {
                "box": {
                    "id": "t_lc40",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 290.0, 476.0, 50.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 290.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 290.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc50",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 380.0, 454.0, 70.0, 20.0 ],
                    "text": "Urban"
                }
            },
            {
                "box": {
                    "id": "t_lc50",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 380.0, 476.0, 50.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 380.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 380.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc60",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 470.0, 454.0, 70.0, 20.0 ],
                    "text": "Bare"
                }
            },
            {
                "box": {
                    "id": "t_lc60",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 470.0, 476.0, 50.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 470.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 470.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc70",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 560.0, 454.0, 70.0, 20.0 ],
                    "text": "Snow/Ice"
                }
            },
            {
                "box": {
                    "id": "t_lc70",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 560.0, 476.0, 50.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 560.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 560.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc80",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 650.0, 454.0, 70.0, 20.0 ],
                    "text": "Water"
                }
            },
            {
                "box": {
                    "id": "t_lc80",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 650.0, 476.0, 50.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 650.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 650.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc90",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 740.0, 454.0, 70.0, 20.0 ],
                    "text": "Wetland"
                }
            },
            {
                "box": {
                    "id": "t_lc90",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 740.0, 476.0, 50.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 740.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 740.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc95",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 830.0, 454.0, 70.0, 20.0 ],
                    "text": "Mangroves"
                }
            },
            {
                "box": {
                    "id": "t_lc95",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 830.0, 476.0, 50.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 830.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 830.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc100",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 920.0, 454.0, 70.0, 20.0 ],
                    "text": "Moss/Lichen"
                }
            },
            {
                "box": {
                    "id": "t_lc100",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 920.0, 476.0, 50.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 920.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 920.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_pergrid_section",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 572.0, 700.0, 20.0 ],
                    "text": "--- PER-GRID MODE: individual cell data when zoomed in (threshold-based). ---"
                }
            },
            {
                "box": {
                    "id": "route_grid",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 6,
                    "outlettype": [ "", "", "", "", "", "" ],
                    "patching_rect": [ 20.0, 600.0, 480.0, 22.0 ],
                    "text": "route /grid/count /grid/pos /grid/lc /grid /viewport"
                }
            },
            {
                "box": {
                    "id": "print_gridcount",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 636.0, 100.0, 22.0 ],
                    "text": "print grid_count"
                }
            },
            {
                "box": {
                    "id": "grid_pos_unpack",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "float", "float" ],
                    "patching_rect": [ 130.0, 636.0, 80.0, 22.0 ],
                    "text": "unpack f f"
                }
            },
            {
                "box": {
                    "id": "print_grid_pos",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 130.0, 680.0, 100.0, 22.0 ],
                    "text": "print grid_pos"
                }
            },
            {
                "box": {
                    "id": "grid_lc_unpack",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 11,
                    "outlettype": [ "float", "float", "float", "float", "float", "float", "float", "float", "float", "float", "float" ],
                    "patching_rect": [ 220.0, 636.0, 200.0, 22.0 ],
                    "text": "unpack f f f f f f f f f f f"
                }
            },
            {
                "box": {
                    "id": "print_grid_lc",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 240.0, 680.0, 100.0, 22.0 ],
                    "text": "print grid_lc"
                }
            },
            {
                "box": {
                    "id": "grid_data_route",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 6,
                    "outlettype": [ "float", "float", "int", "float", "float", "float" ],
                    "patching_rect": [ 440.0, 636.0, 120.0, 22.0 ],
                    "text": "unpack f f i f f f"
                }
            },
            {
                "box": {
                    "id": "print_grid_data",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 440.0, 680.0, 100.0, 22.0 ],
                    "text": "print grid_data"
                }
            },
            {
                "box": {
                    "id": "print_viewport",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 580.0, 636.0, 100.0, 22.0 ],
                    "text": "print viewport"
                }
            }
        ],
        "lines": [
            {
                "patchline": {
                    "destination": [ "route_osc", 0 ],
                    "source": [ "udp_recv", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "route_lc", 0 ],
                    "source": [ "udp_recv", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_landcover", 0 ],
                    "source": [ "route_osc", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_nightlight", 0 ],
                    "source": [ "route_osc", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_population", 0 ],
                    "source": [ "route_osc", 2 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_forest", 0 ],
                    "source": [ "route_osc", 3 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "num_landcover", 0 ],
                    "order": 1,
                    "source": [ "t_landcover", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "out_landcover", 0 ],
                    "order": 0,
                    "source": [ "t_landcover", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_nightlight", 0 ],
                    "order": 1,
                    "source": [ "t_nightlight", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "out_nightlight", 0 ],
                    "order": 0,
                    "source": [ "t_nightlight", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_population", 0 ],
                    "order": 1,
                    "source": [ "t_population", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "out_population", 0 ],
                    "order": 0,
                    "source": [ "t_population", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_forest", 0 ],
                    "order": 1,
                    "source": [ "t_forest", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "out_forest", 0 ],
                    "order": 0,
                    "source": [ "t_forest", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_lc10", 0 ],
                    "source": [ "route_lc", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_lc10", 0 ],
                    "order": 1,
                    "source": [ "t_lc10", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "out_lc10", 0 ],
                    "order": 0,
                    "source": [ "t_lc10", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_lc20", 0 ],
                    "source": [ "route_lc", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_lc20", 0 ],
                    "order": 1,
                    "source": [ "t_lc20", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "out_lc20", 0 ],
                    "order": 0,
                    "source": [ "t_lc20", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_lc30", 0 ],
                    "source": [ "route_lc", 2 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_lc30", 0 ],
                    "order": 1,
                    "source": [ "t_lc30", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "out_lc30", 0 ],
                    "order": 0,
                    "source": [ "t_lc30", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_lc40", 0 ],
                    "source": [ "route_lc", 3 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_lc40", 0 ],
                    "order": 1,
                    "source": [ "t_lc40", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "out_lc40", 0 ],
                    "order": 0,
                    "source": [ "t_lc40", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_lc50", 0 ],
                    "source": [ "route_lc", 4 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_lc50", 0 ],
                    "order": 1,
                    "source": [ "t_lc50", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "out_lc50", 0 ],
                    "order": 0,
                    "source": [ "t_lc50", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_lc60", 0 ],
                    "source": [ "route_lc", 5 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_lc60", 0 ],
                    "order": 1,
                    "source": [ "t_lc60", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "out_lc60", 0 ],
                    "order": 0,
                    "source": [ "t_lc60", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_lc70", 0 ],
                    "source": [ "route_lc", 6 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_lc70", 0 ],
                    "order": 1,
                    "source": [ "t_lc70", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "out_lc70", 0 ],
                    "order": 0,
                    "source": [ "t_lc70", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_lc80", 0 ],
                    "source": [ "route_lc", 7 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_lc80", 0 ],
                    "order": 1,
                    "source": [ "t_lc80", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "out_lc80", 0 ],
                    "order": 0,
                    "source": [ "t_lc80", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_lc90", 0 ],
                    "source": [ "route_lc", 8 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_lc90", 0 ],
                    "order": 1,
                    "source": [ "t_lc90", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "out_lc90", 0 ],
                    "order": 0,
                    "source": [ "t_lc90", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_lc95", 0 ],
                    "source": [ "route_lc", 9 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_lc95", 0 ],
                    "order": 1,
                    "source": [ "t_lc95", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "out_lc95", 0 ],
                    "order": 0,
                    "source": [ "t_lc95", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_lc100", 0 ],
                    "source": [ "route_lc", 10 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_lc100", 0 ],
                    "order": 1,
                    "source": [ "t_lc100", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "out_lc100", 0 ],
                    "order": 0,
                    "source": [ "t_lc100", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "route_grid", 0 ],
                    "source": [ "udp_recv", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "print_gridcount", 0 ],
                    "source": [ "route_grid", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "grid_pos_unpack", 0 ],
                    "source": [ "route_grid", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "print_grid_pos", 0 ],
                    "source": [ "grid_pos_unpack", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "grid_lc_unpack", 0 ],
                    "source": [ "route_grid", 2 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "print_grid_lc", 0 ],
                    "source": [ "grid_lc_unpack", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "grid_data_route", 0 ],
                    "source": [ "route_grid", 3 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "print_grid_data", 0 ],
                    "source": [ "grid_data_route", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "print_viewport", 0 ],
                    "source": [ "route_grid", 4 ]
                }
            }
        ],
        "autosave": 0
    }
}
