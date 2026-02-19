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
        "rect": [ 134.0, 95.0, 1300.0, 853.0 ],
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
                    "patching_rect": [ 20.0, 418.0, 1000.0, 22.0 ],
                    "text": "route /lc/10 /lc/20 /lc/30 /lc/40 /lc/50 /lc/60 /lc/70 /lc/80 /lc/90 /lc/95 /lc/100"
                }
            },
            {
                "box": {
                    "id": "lab_lc10",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 454.0, 80.0, 20.0 ],
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
                    "patching_rect": [ 20.0, 476.0, 54.0, 22.0 ],
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
                    "patching_rect": [ 111.0, 454.0, 80.0, 20.0 ],
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
                    "patching_rect": [ 111.0, 476.0, 54.0, 22.0 ],
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
                    "patching_rect": [ 111.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 111.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc30",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 202.0, 454.0, 80.0, 20.0 ],
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
                    "patching_rect": [ 202.0, 476.0, 54.0, 22.0 ],
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
                    "patching_rect": [ 202.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 202.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc40",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 292.0, 454.0, 80.0, 20.0 ],
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
                    "patching_rect": [ 292.0, 476.0, 54.0, 22.0 ],
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
                    "patching_rect": [ 292.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 292.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc50",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 383.0, 454.0, 80.0, 20.0 ],
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
                    "patching_rect": [ 383.0, 476.0, 54.0, 22.0 ],
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
                    "patching_rect": [ 383.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 383.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc60",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 474.0, 454.0, 80.0, 20.0 ],
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
                    "patching_rect": [ 474.0, 476.0, 54.0, 22.0 ],
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
                    "patching_rect": [ 474.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 474.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc70",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 565.0, 454.0, 80.0, 20.0 ],
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
                    "patching_rect": [ 565.0, 476.0, 54.0, 22.0 ],
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
                    "patching_rect": [ 565.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 565.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc80",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 656.0, 454.0, 80.0, 20.0 ],
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
                    "patching_rect": [ 656.0, 476.0, 54.0, 22.0 ],
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
                    "patching_rect": [ 656.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 656.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc90",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 746.0, 454.0, 80.0, 20.0 ],
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
                    "patching_rect": [ 746.0, 476.0, 54.0, 22.0 ],
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
                    "patching_rect": [ 746.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 746.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc95",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 837.0, 454.0, 80.0, 20.0 ],
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
                    "patching_rect": [ 837.0, 476.0, 54.0, 22.0 ],
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
                    "patching_rect": [ 837.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 837.0, 526.0, 30.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_lc100",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 928.0, 454.0, 80.0, 20.0 ],
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
                    "patching_rect": [ 928.0, 476.0, 54.0, 22.0 ],
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
                    "patching_rect": [ 928.0, 500.0, 60.0, 22.0 ]
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
                    "patching_rect": [ 928.0, 526.0, 30.0, 22.0 ]
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
                    "numinlets": 6,
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
            },
            {
                "box": {
                    "id": "lab_signals",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 780.0, 460.0, 20.0 ],
                    "text": "--- VIEWPORT SIGNALS: /proximity, /delta/*, /coverage ---"
                }
            },
            {
                "box": {
                    "id": "route_signals",
                    "maxclass": "newobj",
                    "numinlets": 6,
                    "numoutlets": 6,
                    "outlettype": [ "", "", "", "", "", "" ],
                    "patching_rect": [ 20.0, 810.0, 1000.0, 22.0 ],
                    "text": "route /proximity /delta/lc /delta/magnitude /delta/rate /coverage"
                }
            },
            {
                "box": {
                    "id": "t_proximity",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 20.0, 850.0, 65.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 90.0, 850.0, 60.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "t_delta_mag",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 420.0, 850.0, 65.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 490.0, 850.0, 60.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "t_delta_rate",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 620.0, 850.0, 65.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 690.0, 850.0, 60.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "t_coverage",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 820.0, 850.0, 65.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 890.0, 850.0, 60.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_prox",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 874.0, 80.0, 20.0 ],
                    "text": "proximity"
                }
            },
            {
                "box": {
                    "id": "lab_dmag",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 420.0, 874.0, 80.0, 20.0 ],
                    "text": "delta/mag"
                }
            },
            {
                "box": {
                    "id": "lab_drate",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 620.0, 874.0, 80.0, 20.0 ],
                    "text": "delta/rate"
                }
            },
            {
                "box": {
                    "id": "lab_cov",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 820.0, 874.0, 80.0, 20.0 ],
                    "text": "coverage"
                }
            },
            {
                "box": {
                    "id": "lab_crossfade",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 1020.0, 500.0, 20.0 ],
                    "text": "--- CROSSFADE CONTROLLER: 11 smoothed volumes ---"
                }
            },
            {
                "box": {
                    "id": "js_crossfade",
                    "maxclass": "newobj",
                    "numinlets": 12,
                    "numoutlets": 11,
                    "outlettype": [ "", "", "", "", "", "", "", "", "", "", "" ],
                    "patching_rect": [ 20.0, 1050.0, 1000.0, 22.0 ],
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
                    "patching_rect": [ 20.0, 1080.0, 500.0, 20.0 ],
                    "text": "--- FOLD-MAPPING: 11 ch → 5 buses (Tree / Crop / Urban / Bare / Water) ---"
                }
            },
            {
                "box": {
                    "id": "lab_col_tree_l",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 1106.0, 155.0, 20.0 ],
                    "text": "Tree left (10,20,30)"
                }
            },
            {
                "box": {
                    "id": "lab_col_tree_r",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 819.0, 1106.0, 160.0, 20.0 ],
                    "text": "Tree right (90,95,100)"
                }
            },
            {
                "box": {
                    "id": "tree_add1",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 20.0, 1130.0, 101.0, 22.0 ],
                    "text": "+ 0."
                }
            },
            {
                "box": {
                    "id": "tree_add2",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 20.0, 1162.0, 201.0, 22.0 ],
                    "text": "+ 0."
                }
            },
            {
                "box": {
                    "id": "tree_add3",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 819.0, 1130.0, 101.0, 22.0 ],
                    "text": "+ 0."
                }
            },
            {
                "box": {
                    "id": "tree_add4",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 819.0, 1162.0, 201.0, 22.0 ],
                    "text": "+ 0."
                }
            },
            {
                "box": {
                    "id": "tree_add5",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 20.0, 1212.0, 800.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 20.0, 1292.0, 60.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_tree_bus",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 1316.0, 250.0, 20.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 320.0, 1292.0, 60.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_crop_bus",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 320.0, 1316.0, 82.0, 20.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 420.0, 1292.0, 60.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_urban_bus",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 420.0, 1316.0, 89.0, 20.0 ],
                    "text": "Urban bus (50)"
                }
            },
            {
                "box": {
                    "id": "water_add1",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 619.0, 1130.0, 101.0, 22.0 ],
                    "text": "+ 0."
                }
            },
            {
                "box": {
                    "id": "js_water_bus",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 619.0, 1238.0, 150.0, 22.0 ],
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
                    "outlettype": [ "float", "int" ],
                    "patching_rect": [ 619.0, 1264.0, 80.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 520.0, 1292.0, 60.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_bare_bus",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 520.0, 1316.0, 81.0, 20.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 619.0, 1292.0, 60.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_water_bus",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 619.0, 1316.0, 200.0, 20.0 ],
                    "text": "Water bus (70,80,ocean)"
                }
            },
            {
                "box": {
                    "id": "lab_icontrig",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 1380.0, 400.0, 20.0 ],
                    "text": "--- ICON TRIGGER: probabilistic auditory icons ---"
                }
            },
            {
                "box": {
                    "id": "js_icontrig",
                    "maxclass": "newobj",
                    "numinlets": 13,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "patching_rect": [ 20.0, 1410.0, 1091.0, 22.0 ],
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
                    "outlettype": [ "int" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 1110.0, 1360.0, 20.0, 20.0 ]
                }
            },
            {
                "box": {
                    "id": "metro_icon",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "bang" ],
                    "patching_rect": [ 1110.0, 1385.0, 70.0, 22.0 ],
                    "text": "metro 100"
                }
            },
            {
                "box": {
                    "id": "lab_metro",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 1110.0, 1415.0, 160.0, 20.0 ],
                    "text": "metro → bang (inlet 12)"
                }
            },
            {
                "box": {
                    "id": "num_icon_cat",
                    "maxclass": "number",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 20.0, 1460.0, 60.0, 22.0 ]
                }
            },
            {
                "box": {
                    "format": 6,
                    "id": "flonum_icon_int",
                    "maxclass": "flonum",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 1110.0, 1460.0, 60.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_icon_cat",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 1484.0, 80.0, 20.0 ],
                    "text": "category"
                }
            },
            {
                "box": {
                    "id": "lab_icon_int",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 1110.0, 1484.0, 80.0, 20.0 ],
                    "text": "intensity"
                }
            },
            {
                "box": {
                    "id": "mul_delta_int",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "float" ],
                    "patching_rect": [ 1110.0, 1510.0, 40.0, 22.0 ],
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
                    "outlettype": [ "", "bang" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 1110.0, 1540.0, 60.0, 22.0 ]
                }
            },
            {
                "box": {
                    "id": "lab_drama",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 1180.0, 1542.0, 170.0, 20.0 ],
                    "text": "intensity × delta/mag"
                }
            },
            {
                "box": {
                    "id": "send_prox",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 20.0, 900.0, 130.0, 22.0 ],
                    "text": "send geosoni_prox"
                }
            },
            {
                "box": {
                    "id": "recv_prox_cf",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 1010.0, 1025.0, 140.0, 22.0 ],
                    "text": "receive geosoni_prox"
                }
            },
            {
                "box": {
                    "id": "recv_prox_it",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 1010.0, 1385.0, 140.0, 22.0 ],
                    "text": "receive geosoni_prox"
                }
            },
            {
                "box": {
                    "id": "recv_prox_wb",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 619.0, 1162.0, 140.0, 22.0 ],
                    "text": "receive geosoni_prox"
                }
            },
            {
                "box": {
                    "id": "send_cov",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 820.0, 900.0, 120.0, 22.0 ],
                    "text": "send geosoni_cov"
                }
            },
            {
                "box": {
                    "id": "recv_cov_wb",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 769.0, 1186.0, 130.0, 22.0 ],
                    "text": "receive geosoni_cov"
                }
            }
        ],
        "lines": [
            {
                "patchline": {
                    "destination": [ "print_grid_data", 0 ],
                    "source": [ "grid_data_route", 0 ]
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
                    "destination": [ "print_grid_pos", 0 ],
                    "source": [ "grid_pos_unpack", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_bare_bus", 0 ],
                    "source": [ "js_crossfade", 5 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_crop_bus", 0 ],
                    "source": [ "js_crossfade", 3 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_urban_bus", 0 ],
                    "source": [ "js_crossfade", 4 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "tree_add1", 1 ],
                    "source": [ "js_crossfade", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "tree_add1", 0 ],
                    "source": [ "js_crossfade", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "tree_add2", 1 ],
                    "source": [ "js_crossfade", 2 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "tree_add3", 1 ],
                    "source": [ "js_crossfade", 9 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "tree_add3", 0 ],
                    "source": [ "js_crossfade", 8 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "tree_add4", 1 ],
                    "source": [ "js_crossfade", 10 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "water_add1", 1 ],
                    "source": [ "js_crossfade", 7 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "water_add1", 0 ],
                    "source": [ "js_crossfade", 6 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_icon_int", 0 ],
                    "order": 1,
                    "source": [ "js_icontrig", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "mul_delta_int", 0 ],
                    "order": 0,
                    "source": [ "js_icontrig", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "num_icon_cat", 0 ],
                    "source": [ "js_icontrig", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "water_max", 1 ],
                    "source": [ "js_water_bus", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_icontrig", 12 ],
                    "source": [ "metro_icon", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_drama_int", 0 ],
                    "source": [ "mul_delta_int", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_water_bus", 1 ],
                    "source": [ "recv_cov_wb", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_crossfade", 11 ],
                    "source": [ "recv_prox_cf", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_icontrig", 11 ],
                    "source": [ "recv_prox_it", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_water_bus", 0 ],
                    "source": [ "recv_prox_wb", 0 ]
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
                    "destination": [ "grid_lc_unpack", 0 ],
                    "source": [ "route_grid", 2 ]
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
                    "destination": [ "print_gridcount", 0 ],
                    "source": [ "route_grid", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "print_viewport", 0 ],
                    "source": [ "route_grid", 4 ]
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
                    "destination": [ "t_lc100", 0 ],
                    "source": [ "route_lc", 10 ]
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
                    "destination": [ "t_lc30", 0 ],
                    "source": [ "route_lc", 2 ]
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
                    "destination": [ "t_lc50", 0 ],
                    "source": [ "route_lc", 4 ]
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
                    "destination": [ "t_lc70", 0 ],
                    "source": [ "route_lc", 6 ]
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
                    "destination": [ "t_lc90", 0 ],
                    "source": [ "route_lc", 8 ]
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
                    "destination": [ "t_forest", 0 ],
                    "source": [ "route_osc", 3 ]
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
                    "destination": [ "t_coverage", 0 ],
                    "source": [ "route_signals", 4 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_delta_mag", 0 ],
                    "source": [ "route_signals", 2 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_delta_rate", 0 ],
                    "source": [ "route_signals", 3 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "t_proximity", 0 ],
                    "source": [ "route_signals", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_coverage", 0 ],
                    "order": 0,
                    "source": [ "t_coverage", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "send_cov", 0 ],
                    "order": 1,
                    "source": [ "t_coverage", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_delta_mag", 0 ],
                    "order": 1,
                    "source": [ "t_delta_mag", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "mul_delta_int", 1 ],
                    "order": 0,
                    "source": [ "t_delta_mag", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_delta_rate", 0 ],
                    "source": [ "t_delta_rate", 0 ]
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
                    "destination": [ "flonum_lc10", 0 ],
                    "order": 3,
                    "source": [ "t_lc10", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_crossfade", 0 ],
                    "order": 2,
                    "source": [ "t_lc10", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_icontrig", 0 ],
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
                    "destination": [ "flonum_lc100", 0 ],
                    "order": 1,
                    "source": [ "t_lc100", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_crossfade", 10 ],
                    "order": 3,
                    "source": [ "t_lc100", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_icontrig", 10 ],
                    "order": 2,
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
                    "destination": [ "flonum_lc20", 0 ],
                    "order": 3,
                    "source": [ "t_lc20", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_crossfade", 1 ],
                    "order": 2,
                    "source": [ "t_lc20", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_icontrig", 1 ],
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
                    "destination": [ "flonum_lc30", 0 ],
                    "order": 3,
                    "source": [ "t_lc30", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_crossfade", 2 ],
                    "order": 2,
                    "source": [ "t_lc30", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_icontrig", 2 ],
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
                    "destination": [ "flonum_lc40", 0 ],
                    "order": 3,
                    "source": [ "t_lc40", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_crossfade", 3 ],
                    "order": 2,
                    "source": [ "t_lc40", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_icontrig", 3 ],
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
                    "destination": [ "flonum_lc50", 0 ],
                    "order": 2,
                    "source": [ "t_lc50", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_crossfade", 4 ],
                    "order": 3,
                    "source": [ "t_lc50", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_icontrig", 4 ],
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
                    "destination": [ "flonum_lc60", 0 ],
                    "order": 1,
                    "source": [ "t_lc60", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_crossfade", 5 ],
                    "order": 3,
                    "source": [ "t_lc60", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_icontrig", 5 ],
                    "order": 2,
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
                    "destination": [ "flonum_lc70", 0 ],
                    "order": 1,
                    "source": [ "t_lc70", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_crossfade", 6 ],
                    "order": 3,
                    "source": [ "t_lc70", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_icontrig", 6 ],
                    "order": 2,
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
                    "destination": [ "flonum_lc80", 0 ],
                    "order": 1,
                    "source": [ "t_lc80", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_crossfade", 7 ],
                    "order": 3,
                    "source": [ "t_lc80", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_icontrig", 7 ],
                    "order": 2,
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
                    "destination": [ "flonum_lc90", 0 ],
                    "order": 1,
                    "source": [ "t_lc90", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_crossfade", 8 ],
                    "order": 3,
                    "source": [ "t_lc90", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_icontrig", 8 ],
                    "order": 2,
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
                    "destination": [ "flonum_lc95", 0 ],
                    "order": 1,
                    "source": [ "t_lc95", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_crossfade", 9 ],
                    "order": 3,
                    "source": [ "t_lc95", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "js_icontrig", 9 ],
                    "order": 2,
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
                    "destination": [ "flonum_proximity", 0 ],
                    "order": 0,
                    "source": [ "t_proximity", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "send_prox", 0 ],
                    "order": 1,
                    "source": [ "t_proximity", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "metro_icon", 0 ],
                    "source": [ "toggle_icon", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "tree_add2", 0 ],
                    "source": [ "tree_add1", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "tree_add5", 0 ],
                    "source": [ "tree_add2", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "tree_add4", 0 ],
                    "source": [ "tree_add3", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "tree_add5", 1 ],
                    "source": [ "tree_add4", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_tree_bus", 0 ],
                    "source": [ "tree_add5", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "route_grid", 0 ],
                    "order": 1,
                    "source": [ "udp_recv", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "route_lc", 0 ],
                    "order": 2,
                    "source": [ "udp_recv", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "route_osc", 0 ],
                    "order": 3,
                    "source": [ "udp_recv", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "route_signals", 0 ],
                    "order": 0,
                    "source": [ "udp_recv", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "water_max", 0 ],
                    "source": [ "water_add1", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "flonum_water_bus", 0 ],
                    "source": [ "water_max", 0 ]
                }
            }
        ],
        "autosave": 0
    }
}