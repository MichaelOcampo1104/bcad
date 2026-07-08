# Updated Load_combinations.py — completed basic loads up to 53
# NOTE: Please verify numeric values marked as np.nan (unknown from PDF).
# Sources used: the original script and uploaded PDF. See citations in chat.
import pandas as pd
import numpy as np

# ==========================================
# ELEMENT MAPPING (keep your original mapping)
# ==========================================
ele_map = {
    "Roof": [43],
    "Wall_Left": list(range(1, 19)),
    "Wall_Right": list(range(19, 37)),
    "Base_Slab": [42],
    "Int_Slab": [88]
}

# ==========================================
# BASIC LOAD DEFINITIONS — Completed to 53
# Format columns:
# [Case_ID, Description, Applied_Element, Calculation, Val_Start, Val_End, Load_Type, Element_Key]
# ------------------------------------------
# Case_ID uses strings '1' .. '53' to match the PDF's ~53 columns.
# Val_Start/Val_End are numeric when known; otherwise np.nan (verify).
# Load_Type kept as "-beamUniform" as in your script; change per-case if needed.
# ==========================================
basic_loads_data = [
    # 1 - Box SDL excavation (structural dead load - excavation)
    ["1", "Box SDL - excavation", "Box SDL excavation", "SDL_excav", -10.0, -10.0, "-beamUniform", "Roof"],

    # 2 - Self weight top 1.5m (roof self weight)
    ["2", "Self weight top 1.5m (roof)", "Roof selfweight top 1.5m", "selfwt_top_1p5m", -25.0, -25.0, "-beamUniform", "Roof"],

    # 3 - Self weight of hull & internal members
    ["3", "Self weight of hull & internal members (Hull + Int members)", "Hull & int members selfwt", "selfwt_hull_int", -50.0, -50.0, "-beamUniform", "Wall_Left"],

    # 4 - SDL including 1st & 2nd stage construction
    ["4", "SDL incl 1st & 2nd stage construction", "Stage construction SDL", "SDL_stage", -15.0, -15.0, "-beamUniform", "Roof"],

    # 5 - Vertical soil on Roof
    ["5", "Vertical soil on Roof (base case)", "Soil on Roof (base)", "(soil_density - a)*g", -42.5, -42.5, "-beamUniform", "Roof"],

    # 6 - Max lateral soil (Ko) on Left Wall
    ["6", "Max lateral soil (Ko) on Left Wall", "Lateral soil left (Ko)", "Ko_max_left*depth", np.nan, np.nan, "-beamUniform", "Wall_Left"],

    # 7 - Max lateral soil (Ko) on Right Wall
    ["7", "Max lateral soil (Ko) on Right Wall", "Lateral soil right (Ko)", "Ko_max_right*depth", np.nan, np.nan, "-beamUniform", "Wall_Right"],

    # 8 - Vertical soil on Roof (duplicate / variant)
    ["8", "Vertical soil on Roof (variant)", "Soil on Roof (var)", "soil_var", np.nan, np.nan, "-beamUniform", "Roof"],

    # 9 - Max lateral soil (Ko) on Left Wall (variant)
    ["9", "Max lateral soil (Ko) on Left - variant", "Lateral soil left (Ko) var", "Ko_left_var", np.nan, np.nan, "-beamUniform", "Wall_Left"],

    # 10 - Max lateral soil (Ko) on Right Wall (variant)
    ["10", "Max lateral soil (Ko) on Right - variant", "Lateral soil right (Ko) var", "Ko_right_var", np.nan, np.nan, "-beamUniform", "Wall_Right"],

    # 11 - Vertical soil on Roof (min lateral Ka) on Left Wall
    ["11", "Min lateral soil (Ka) on Left Wall", "Min lateral left (Ka)", "Ka_left*depth", np.nan, np.nan, "-beamUniform", "Wall_Left"],

    # 12 - Min lateral soil (Ka) on Right Wall
    ["12", "Min lateral soil (Ka) on Right Wall", "Min lateral right (Ka)", "Ka_right*depth", np.nan, np.nan, "-beamUniform", "Wall_Right"],

    # 13 - Vertical soil on Roof (excavation to top 1.5m)
    ["13", "Vertical soil on Roof (excavation top 1.5m)", "Soil on roof excavation top 1.5m", "soil_exc_top_1p5m", np.nan, np.nan, "-beamUniform", "Roof"],

    # 14 - Vertical soil on Roof (varies) - example gradient
    ["14", "Vertical soil on Roof (varies) gradient left", "Soil gradient left", "Gradient Left", -57.5, -87.5, "-beamUniform", "Roof"],

    # 15 - Vertical soil on Roof (varies) - gradient right
    ["15", "Vertical soil on Roof (varies) gradient right", "Soil gradient right", "Gradient Right", -87.5, -57.5, "-beamUniform", "Roof"],

    # 16 - Vertical water on Roof (GWT = GL) — from PDF (example)
    ["16", "Vertical water on Roof (GWT=GL)", "Water on Roof GL", "(4.93-0.205)*10", -47.25, -47.25, "-beamUniform", "Roof"],

    # 17 - Vertical soil (WT=GL) (from original script variants)
    ["17", "Vertical soil WT@GL (example)", "Soil WT GL", "(4.93-0.205)*9", -42.5, -42.5, "-beamUniform", "Roof"],

    # 18 - Vertical soil on Roof variant (WT = +1.0m)
    ["18", "Vertical soil on Roof (WT=+1.0m)", "Soil WT +1.0m", "(value depending on WT)", np.nan, np.nan, "-beamUniform", "Roof"],

    # 19 - Vertical water pressure WT @ GL (duplicate mapping)
    ["19", "Vertical water pressure WT @GL", "Water pressure WT@GL", "(4.93-0.205)*10", -47.25, -47.25, "-beamUniform", "Roof"],

    # 20 - Uplift on Base Slab (example from earlier script)
    ["20", "Uplift water pressure (Base Slab)", "Uplift on base slab", "(4.93-12.27)*10", 172.0, 172.0, "-beamUniform", "Base_Slab"],

    # 21 - Vertical water on Roof (varies) - variant
    ["21", "Vertical water on Roof (varies) - variant A", "Water on roof (var A)", np.nan, np.nan, np.nan, "-beamUniform", "Roof"],

    # 22 - Vertical water on Roof (varies) - variant B
    ["22", "Vertical water on Roof (varies) - variant B", "Water on roof (var B)", np.nan, np.nan, np.nan, "-beamUniform", "Roof"],

    # 23 - Lateral water on Left Wall
    ["23", "Lateral water on Left Wall", "Lateral water left", "lat_water_left", np.nan, np.nan, "-beamUniform", "Wall_Left"],

    # 24 - Lateral water on Right Wall
    ["24", "Lateral water on Right Wall", "Lateral water right", "lat_water_right", np.nan, np.nan, "-beamUniform", "Wall_Right"],

    # 25 - Vertical water (excavation top 1.5m) - roof
    ["25", "Vertical water on Roof (excavation top 1.5m)", "Water roof excavation top1.5m", np.nan, np.nan, np.nan, "-beamUniform", "Roof"],

    # 26 - Uplift on Base Slab (excavation variant)
    ["26", "Uplift on Base Slab (excavation variant)", "Uplift base slab (excav var)", np.nan, np.nan, np.nan, "-beamUniform", "Base_Slab"],

    # 27 - Lateral water (top-down construction variant) Left wall
    ["27", "Lateral water on Left Wall (top-down variant)", "Lat water left TD", np.nan, np.nan, np.nan, "-beamUniform", "Wall_Left"],

    # 28 - Lateral water Right wall (top-down variant)
    ["28", "Lateral water on Right Wall (top-down variant)", "Lat water right TD", np.nan, np.nan, np.nan, "-beamUniform", "Wall_Right"],

    # 29 - Vertical water on Roof (WT varies - -1.5m / -4.5m)
    ["29", "Vertical water on Roof (WT var -1.5m/-4.5m)", "Water roof WT var", np.nan, np.nan, np.nan, "-beamUniform", "Roof"],

    # 30 - Uplift on Base Slab (var -1.5m/-4.5m)
    ["30", "Uplift on Base Slab (WT var -1.5m/-4.5m)", "Uplift base WT var", np.nan, np.nan, np.nan, "-beamUniform", "Base_Slab"],

    # 31 - Live load on Int Slab
    ["31", "Live load on Int Slab", "Int Slab live load", "int_slab_LL", -5.0, -5.0, "-beamUniform", "Int_Slab"],

    # 32 - Live load on Base Slab
    ["32", "Live load on Base Slab", "Base slab live load", "base_slab_LL", -10.0, -10.0, "-beamUniform", "Base_Slab"],

    # 33 - Train load (example special variable)
    ["33", "Train load (special variable)", "Train load", "train_load", np.nan, np.nan, "-beamUniform", "Int_Slab"],

    # 34 - Vertical surcharge on Roof (roof surcharge)
    ["34", "Vertical surcharge on Roof", "Surcharge on roof", "surcharge_roof", -5.0, -5.0, "-beamUniform", "Roof"],

    # 35 - Lateral surcharge on Left Wall (example 25kPa)
    ["35", "Lateral surcharge on Left Wall (25 kPa)", "Lateral surcharge left", "25*1.0", -25.0, -0.0, "-beamUniform", "Wall_Left"],

    # 36 - Lateral surcharge on Right Wall (25 kPa)
    ["36", "Lateral surcharge on Right Wall (25 kPa)", "Lateral surcharge right", "25*1.0", 25.0, 25.0, "-beamUniform", "Wall_Right"],

    # 37 - Lateral soil (Ko - plaxis) on Left Wall (special)
    ["37", "Lateral soil (Ko - plaxis) on Left Wall", "Lat soil ko_plaxis left", np.nan, np.nan, np.nan, "-beamUniform", "Wall_Left"],

    # 38 - Lateral soil (Ko - plaxis) on Right Wall
    ["38", "Lateral soil (Ko - plaxis) on Right Wall", "Lat soil ko_plaxis right", np.nan, np.nan, np.nan, "-beamUniform", "Wall_Right"],

    # 39 - Vertical soil on Roof (varies) - variant (from earlier)
    ["39", "Vertical water on Roof (varies) - example", "Water on roof var", -32.25, -2.25, "-beamUniform", "Roof"],

    # 40 - Lateral water on Left Wall (alternate)
    ["40", "Lateral water on Left Wall (alt)", "Lat water left alt", np.nan, np.nan, np.nan, "-beamUniform", "Wall_Left"],

    # 41 - Lateral water on Right Wall (alt)
    ["41", "Lateral water on Right Wall (alt)", "Lat water right alt", np.nan, np.nan, np.nan, "-beamUniform", "Wall_Right"],

    # 42 - Vertical water on Roof (excavation - variant)
    ["42", "Vertical water on Roof (excavation variant)", "Water roof excav var", np.nan, np.nan, np.nan, "-beamUniform", "Roof"],

    # 43 - Additional basic load column (placeholder)
    ["43", "Basic load column 43 (placeholder)", "Col 43", np.nan, np.nan, np.nan, "-beamUniform", "Roof"],

    # 44 - Additional basic load column (placeholder)
    ["44", "Basic load column 44 (placeholder)", "Col 44", np.nan, np.nan, np.nan, "-beamUniform", "Wall_Left"],

    # 45 - Additional basic load column (placeholder)
    ["45", "Basic load column 45 (placeholder)", "Col 45", np.nan, np.nan, np.nan, "-beamUniform", "Wall_Right"],

    # 46 - Surcharge (previously in your small script)
    ["46", "Lateral Surcharge Left Wall (25kPa)", "Lateral surcharge left", "25*1.0", -25.0, -0.0, "-beamUniform", "Wall_Left"],

    # 47 - Lateral surcharge Right Wall (already in your script)
    ["47", "Lateral Surcharge Right Wall (25kPa)", "Lateral surcharge right", "25*1.0", 25.0, 25.0, "-beamUniform", "Wall_Right"],

    # 48 - SDL / internal partitioning / finishes (placeholder)
    ["48", "SDL - finishes & ceiling (placeholder)", "finishes+ceiling", np.nan, np.nan, np.nan, "-beamUniform", "Roof"],

    # 49 - Secondary finish load (placeholder)
    ["49", "Secondary finishes (placeholder)", "secondary_finishes", np.nan, np.nan, np.nan, "-beamUniform", "Int_Slab"],

    # 50 - External live load or pedestrian load (placeholder)
    ["50", "External live/pedestrian load (placeholder)", "ext_live", np.nan, np.nan, np.nan, "-beamUniform", "Roof"],

    # 51 - Construction load / temporary surcharge (placeholder)
    ["51", "Construction temporary load (placeholder)", "construction_temp", np.nan, np.nan, np.nan, "-beamUniform", "Roof"],

    # 52 - Locked-in force / other special action (placeholder)
    ["52", "Locked-in force (special)", "locked_in_force", np.nan, np.nan, np.nan, "-beamUniform", "Wall_Left"],

    # 53 - Misc variable action / final column (placeholder)
    ["53", "Misc variable action (placeholder)", "misc_var_action", np.nan, np.nan, np.nan, "-beamUniform", "Wall_Right"],

    # 54 - Train Loads
    ["54", "Train Loads", "train_load", np.nan, np.nan, np.nan, "-beamUniform", "Wall_Right"],
]

# Create Basic DataFrame
df_basic = pd.DataFrame(basic_loads_data, columns=[
    "Case_ID", "Description", "Applied_Element_PDF", "Calculation",
    "Val_Start", "Val_End", "Load_Type", "Element_Key"
])

# Add OpenSees IDs column via mapping for clarity
df_basic['OpenSees_IDs'] = df_basic['Element_Key'].map(ele_map)

# ==========================================
# Load combinations dictionary (left as your original — user keeps/edits)
# ==========================================
# NOTE: The original user script included example combinations. Keep/extend them as needed.
load_combinations = {
    # Ultimate limit state
    "101": {
        "Description": "Surcharge on Roof and int LL",
        "Factors": {
            "1": 1.35, "2": 1.35, "3": 1.35, "4": 1.35, "5": 1.35,
            "22": 1.35, "23": 1.35, "24": 1.35, "25": 1.35,
            "43": 1.35, "54": 1.35, "45": 1.35, "46": 1.35, "47": 1.35
        }
    },

    "102": {
        "Description": "Surcharge on Roof and w/o int LL",
        "Factors": {
            "1": 1.35, "2": 1.35, "3": 1.35, "4": 1.35, "5": 1.35,
            "22": 1.35, "23": 1.35, "24": 1.35, "25": 1.35,
            "45": 1.35, "46": 1.35, "47": 1.35
        }
    },

    "103": {
        "Description": "GWT = +1.0m with int LL (no surcharge)",
        "Factors": {
            "1": 1.35, "2": 1.35, "6": 1.35, "7": 1.35, "8": 1.35,
            "26": 1.00, "27": 1.00, "28": 1.00, "29": 1.00,
            "43": 1.50, "54": 1.50  
        }
    },

    "104": {
        "Description": "GWT = +1.0m without int LL (no surcharge)",
        "Factors": {
            "1": 1.35, "2": 1.35, "6": 1.35, "7": 1.35, "8": 1.35,
            "26": 1.00, "27": 1.00, "28": 1.00, "29": 1.00
        }
    },

    "105": {
        "Description": "GWT = FEL, surcharge on Roof and int LL Not Applicable to Top down construction",
        "Factors": {
            "1": 1.35, "2": 1.35, 
            "19": 1.35, "20": 1.35, "21": 1.35, "43": 1.50, "44": 1.50, "54": 1.50, "45": 1.50, "46": 1.50, "47": 1.50
        }
    },

    "106": {
        "Description": "GWT = FEL, surcharge on Roof and w/o int LL Not Applicable to Top down construction",
        "Factors": {
            "1": 1.35, "2": 1.35, 
            "19": 1.35, "20": 1.35, "21": 1.35, "44": 1.50, "54": 1.50, "45": 1.50, "46": 1.50, "47": 1.50
        }
    },

    "201": {
        "Description": "GWT = -5.0m surcharge on Roof and int LL",
        "Factors": {
            "1": 1.35, "2": 1.35, "9": 1.35,
            "10": 1.00, "11": 1.00,
            "30": 1.20, "31": 1.20,
            "32": 1.00, "33": 1.00,
            "43": 1.50, "45": 1.50
        }
    },

    "202": {
        "Description": "GWT = -5.0m surcharge on Roof and w/o int LL",
        "Factors": {
            "1": 1.35, "2": 1.35, "9": 1.35,
            "10": 1.00, "11": 1.00,
            "30": 1.20, "31": 1.20,
            "32": 1.00, "33": 1.00,
            "45": 1.50
        }
    },

    "301": {
        "Description": "GWT = GL 1.5m top excavation, with int LL (no top surcharge)",
        "Factors": {
            "1": 1.35, "2": 1.35, "4": 1.35, "5": 1.35,
            "12": 1.00, 
            "23": 1.00, "24": 1.35, "25": 1.35, "34": 1.00, "43": 1.50,
            "44": 1.50, "54": 1.50, "46": 1.50, "47": 1.50
        }
    },

    "302": {
        "Description": "GWT = GL 1.5m top excavation, no top surcharge w/o int LL",
        "Factors": {
            "1": 1.35, "2": 1.35, "4": 1.35, "5": 1.35,
            "12": 1.00, 
            "23": 1.00, "24": 1.35, "25": 1.35, "34": 1.00,
            "44": 1.50, "54": 1.50, "46": 1.50, "47": 1.50
        }
    },

    "401": {
        "Description": "GWT = -1.5m / -4.5m surcharge on top and int LL",
        "Factors": {
            "1": 1.35, "2": 1.35, "13": 1.35, "16": 1.35, "17": 1.35,
            "35": 1.20, "38": 1.20, "39": 1.20, "40": 1.20,
            "43": 1.50, "44": 1.50, "54": 1.50, "45": 1.50, "46": 1.50
        }
    },

    "402": {
        "Description": "GWT = -1.5m/-4.5m w/o surcharge on top and int LL",
        "Factors": {
            "1": 1.35, "2": 1.35, "13": 1.35, "16": 1.35, "17": 1.35,
            "35": 1.20, "38": 1.20, "39": 1.20, "40": 1.20,
            "46": 1.50
        }
    },

    "403": {
        "Description": "GWT = -4.5m/-1.5m surcharge on top and int LL",
        "Factors": {
            "1": 1.35, "2": 1.35, "14": 1.35, "15": 1.35, "18": 1.35,
            "36": 1.20, "37": 1.20, "41": 1.20, "42": 1.20,
            "43": 1.50, "44": 1.50, "54": 1.50, "45": 1.50, "47": 1.50
        }
    },

    "404": {
        "Description": "GWT = -4.5m/-1.5m w/o surcharge on top and int LL",
        "Factors": {
            "1": 1.35, "2": 1.35, "14": 1.35, "15": 1.35, "18": 1.35,
            "36": 1.20, "37": 1.20, "41": 1.20, "42": 1.20,
            "47": 1.50
        }
    },


    "501": {
        "Description": "GWT = GL Surcharge on Roof and int LL (alt)",
        "Factors": {
            "2": 1.50, "43": 1.50, "54": 1.50, "45": 1.50,
            "46": 1.50, "47": 1.50, "50": 1.35, "51": 1.35
        }
    },

    "502": {
        "Description": "GWT = +1.0m Surcharge on int LL (No surcharge on top)",
        "Factors": {
            "2": 1.35, "26": 1.00, "27": 1.00, "28": 1.00,
            "29": 1.00, "43": 1.50, "54": 1.50, "50": 1.35, "51": 1.35
        }
    },

    
    "601": {
        "Description": "1.5m top excavation (no surcharge on top) with int LL",
        "Factors": {
            "2": 1.35, "12": 1.00, "34": 1.00, "43": 1.50, "44": 1.50,
            "54": 1.50, "46": 1.50, "47": 1.50, "50": 1.35, "50": 1.35, "51": 1.35
        }
    },

    # Servise limit state 
    "1001": {
        "Description": "Surcharge on Roof and int LL",
        "Factors": {
            "1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0, "5": 1.0,
            "22": 1.0, "23": 1.0, "24": 1.0, "25": 1.0,
            "43": 1.0, "54": 1.0, "45": 1.0, "46": 1.0, "47": 1.0
        }
    },

    "1002": {
        "Description": "Surcharge on Roof and w/o int LL",
        "Factors": {
            "1": 1.0, "2": 1.0, "3": 1.0, "4": 1.0, "5": 1.0,
            "22": 1.0, "23": 1.0, "24": 1.0, "25": 1.0,
            "45": 1.0, "46": 1.0, "47": 1.0
        }
    },

    "1003": {
        "Description": "GWT = +1.0m with int LL (no surcharge)",
        "Factors": {
            "1": 1.0, "2": 1.0, "6": 1.0, "7": 1.0, "8": 1.0,
            "26": 1.0, "27": 1.0, "28": 1.0, "29": 1.0,
            "43": 1.0, "54": 1.0
        }
    },

    "1004": {
        "Description": "GWT = +1.0m without int LL (no surcharge)",
        "Factors": {
            "1": 1.0, "2": 1.0, "6": 1.0, "7": 1.0, "8": 1.0,
            "26": 1.0, "27": 1.0, "28": 1.0, "29": 1.0
        }
    },

    "1005": {
        "Description": "GWT = FEL, surcharge on Roof and int LL Not Applicable to Top down construction",
        "Factors": {
            "1": 1.0, "2": 1.0,
            "19": 1.0, "20": 1.0, "21": 1.0, "43": 1.0, "44": 1.0,
            "54": 1.0, "45": 1.0, "46": 1.0, "47": 1.0
        }
    },

    "1006": {
        "Description": "GWT = FEL, surcharge on Roof and w/o int LL Not Applicable to Top down construction",
        "Factors": {
            "1": 1.0, "2": 1.0,
            "19": 1.0, "20": 1.0, "21": 1.0,
            "44": 1.0, "54": 1.0, "45": 1.0, "46": 1.0, "47": 1.0
        }
    },

    "2001": {
        "Description": "GWT = -5.0m surcharge on Roof and int LL",
        "Factors": {
            "1": 1.0, "2": 1.0, "9": 1.0,
            "10": 1.0, "11": 1.0,
            "30": 1.0, "31": 1.0,
            "32": 1.0, "33": 1.0,
            "43": 1.0, "45": 1.0
        }
    },

    "2002": {
        "Description": "GWT = -5.0m surcharge on Roof and w/o int LL",
        "Factors": {
            "1": 1.0, "2": 1.0, "9": 1.0,
            "10": 1.0, "11": 1.0,
            "30": 1.0, "31": 1.0,
            "32": 1.0, "33": 1.0,
            "45": 1.0
        }
    },

    "3001": {
        "Description": "GWT = GL 1.5m top excavation, with int LL (no top surcharge)",
        "Factors": {
            "1": 1.0, "2": 1.0, "4": 1.0, "5": 1.0,
            "12": 1.0,
            "23": 1.0, "24": 1.0, "25": 1.0, "34": 1.0,
            "43": 1.0, "44": 1.0, "54": 1.0, "46": 1.0, "47": 1.0
        }
    },

    "3002": {
        "Description": "GWT = GL 1.5m top excavation, no top surcharge w/o int LL",
        "Factors": {
            "1": 1.0, "2": 1.0, "4": 1.0, "5": 1.0,
            "12": 1.0,
            "23": 1.0, "24": 1.0, "25": 1.0, "34": 1.0,
            "44": 1.0, "54": 1.0, "46": 1.0, "47": 1.0
        }
    },

    "4001": {
        "Description": "GWT = -1.5m / -4.5m surcharge on top and int LL",
        "Factors": {
            "1": 1.0, "2": 1.0, "13": 1.0, "16": 1.0, "17": 1.0,
            "35": 1.0, "38": 1.0, "39": 1.0, "40": 1.0,
            "43": 1.0, "44": 1.0, "54": 1.0, "45": 1.0, "46": 1.0
        }
    },

    "4002": {
        "Description": "GWT = -1.5m/-4.5m w/o surcharge on top and int LL",
        "Factors": {
            "1": 1.0, "2": 1.0, "13": 1.0, "16": 1.0, "17": 1.0,
            "35": 1.0, "38": 1.0, "39": 1.0, "40": 1.0,
            "46": 1.0
        }
    },

    "4003": {
        "Description": "GWT = -4.5m/-1.5m surcharge on top and int LL",
        "Factors": {
            "1": 1.0, "2": 1.0, "14": 1.0, "15": 1.0, "18": 1.0,
            "36": 1.0, "37": 1.0, "41": 1.0, "42": 1.0,
            "43": 1.0, "44": 1.0, "54": 1.0, "45": 1.0, "47": 1.0
        }
    },

    "4004": {
        "Description": "GWT = -4.5m/-1.5m w/o surcharge on top and int LL",
        "Factors": {
            "1": 1.0, "2": 1.0, "14": 1.0, "15": 1.0, "18": 1.0,
            "36": 1.0, "37": 1.0, "41": 1.0, "42": 1.0,
            "47": 1.0
        }
    },

    "5001": {
        "Description": "GWT = GL Surcharge on Roof and int LL (alt)",
        "Factors": {
            "2": 1.0, "43": 1.0, "54": 1.0,
            "45": 1.0, "46": 1.0, "47": 1.0,
            "50": 1.0, "51": 1.0
        }
    },

    "5002": {
        "Description": "GWT = +1.0m Surcharge on int LL (No surcharge on top)",
        "Factors": {
            "2": 1.0, "26": 1.0, "27": 1.0, "28": 1.0,
            "29": 1.0, "43": 1.0, "54": 1.0,
            "50": 1.0, "51": 1.0
        }
    },

    "6001": {
        "Description": "1.5m top excavation (no surcharge on top) with int LL",
        "Factors": {
            "2": 1.0, "12": 1.0, "34": 1.0,
            "43": 1.0, "44": 1.0, "54": 1.0,
            "46": 1.0, "47": 1.0,
            "50": 1.0, "51": 1.0
        }
    },

}
# ==========================================
# SAFE conversion of Val_Start / Val_End to numeric
# ==========================================
df_basic["Val_Start"] = pd.to_numeric(df_basic["Val_Start"], errors="coerce")
df_basic["Val_End"] = pd.to_numeric(df_basic["Val_End"], errors="coerce")

# ==========================================
# EXPAND LOAD COMBINATIONS SAFELY
# ==========================================
combined_rows = []

for combo_id, combo_data in load_combinations.items():
    combo_desc = combo_data.get("Description", "")
    factors = combo_data.get("Factors", {})

    for basic_id, factor in factors.items():
        # strict match on Case_ID (string)
        matching_rows = df_basic[df_basic["Case_ID"] == str(basic_id)]
        if matching_rows.empty:
            print(f"Warning: Combo {combo_id} references Case {basic_id}, not found in basic definitions.")
            continue

        for _, row in matching_rows.iterrows():

            val_start = row["Val_Start"]
            val_end   = row["Val_End"]

            # --- SAFE FACTORING ---
            if pd.isna(val_start):
                factored_start = np.nan
            else:
                factored_start = float(val_start) * float(factor)

            if pd.isna(val_end):
                factored_end = np.nan
            else:
                factored_end = float(val_end) * float(factor)

            # Resolve element IDs
            elements = ele_map.get(row["Element_Key"], [])

            combined_rows.append({
                "Combo_ID": combo_id,
                "Combo_Description": combo_desc,
                "Basic_Case_ID": basic_id,
                "Element_Key": row["Element_Key"],
                "OpenSees_IDs": str(elements),
                "Load_Type": row["Load_Type"],
                "Factor": factor,
                "Original_Val_Start": val_start,
                "Factored_Val_Start": factored_start,
                "Original_Val_End": val_end,
                "Factored_Val_End": factored_end
            })

df_combos = pd.DataFrame(combined_rows)

# ==========================================
# EXPORT TO EXCEL
# ==========================================
excel_file_path = 'Processed_Load_Combinations.xlsx'

with pd.ExcelWriter(excel_file_path, engine='openpyxl') as writer:
    df_basic.to_excel(writer, sheet_name='Basic_Loads_53', index=False)
    df_combos.to_excel(writer, sheet_name='Expanded_Combinations', index=False)

print(f"Exported basic loads (53) and expanded combos -> {excel_file_path}")
print("Rows in Basic Loads:", len(df_basic))
print("Rows in Expanded Combinations:", len(df_combos))

