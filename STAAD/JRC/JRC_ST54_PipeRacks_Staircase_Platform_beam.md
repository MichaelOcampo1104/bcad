****************************************************
* * P R O B L E M S T A T I S T I C S
* STAAD.Pro * -----------------------------------
* Version 2007 Build 04 *
SUPPORTS = 2/ 1/ 2
* Research Engineers, Intl. *
* Date= DEC 18, 2012 * SOLVER USED IS THE IN-CORE ADVANCED SOLVER
* * TOTAL PRIMARY
LOAD CASES = 2, TOTAL DEGREES OF FREEDOM = 6
****************************************************
37.
PRINT SECTION DISPL ALL
STAAD SPACE
INPUT FILE: 121211 FLOOR JOIST.STD
START JOB INFORMATION
ENGINEER DATE 29-AUG-12
END JOB INFORMATION
INPUT WIDTH 79
UNIT METER KN
JOINT COORDINATES
1 0 0 0; 2 1.6 0 0
MEMBER INCIDENCES
1 1 2
11.
DEFINE MATERIAL START
ISOTROPIC STEEL
E 2.05E+008
POISSON 0.3
DENSITY 76.8195
ALPHA 1.2E-005
DAMP 0.03
END DEFINE MATERIAL
MEMBER PROPERTY JAPANESE
1 TABLE ST C150X75X6.5
21.
CONSTANTS
MATERIAL STEEL ALL
23.
SUPPORTS
1 PINNED
2 FIXED BUT MY MZ KMX 0.00099
26.
LOAD 1
LOADTYPE NONE TITLE DEAD
LOAD: DL
MEMBER
LOAD
1 UNI GY -0.75
29.
LOAD 2
LOADTYPE NONE TITLE LIVE
LOAD: LL
MEMBER
LOAD
1 UNI GY -5
32.
LOAD COMB 3 1.0DL + 1.0LL
1 1.0 2 1.0
34.
LOAD COMB 4 1.4DL + 1.6LL
1 1.4 2 1.6
36.
PERFORM ANALYSIS
S:\project\2608118a\eng\2007 AG structural works\ST54 - DESIGN FILES\STAAD\121211 Floor Joist\121211Pa gFeL O1O Ro fJ O7IST.anl S:\project\2608118a\eng\2007 AG structural works\ST54 - DESIGN FILES\STAAD\121211 Floor Joist\121211Pa gFeL O2O Ro fJ O7IST.anl
Tuesday, December 18, 2012, 09:52 PM Tuesday, December 18, 2012, 09:522 3P9M
MEMBER SECTION DISPLACEMENTS MEMBER END FORCES STRUCTURE TYPE = SPACE
---------------------------- -----------------
UNIT =INCHES FOR FPS AND CM FOR METRICS/SI SYSTEM ALL UNITS ARE -- KN METE (LOCAL )
MEMB
LOAD GLOBAL X,Y,Z DISPL FROM START TO END JOINTS AT 1/12TH PTS MEMBER
LOAD JT AXIAL SHEAR-Y SHEAR-Z TORSION MOM-Y MOM-Z
1 1 0.0000 0.0000 0.0000 0.0000 -0.0009 0.0000
0.0000 -0.0018 0.0000 0.0000 -0.0026 0.0000
0.0000 -0.0031 0.0000 0.0000 -0.0035 0.0000 1 1 1 0.00 0.60 0.00 0.00 0.00 0.00
0.0000 -0.0036 0.0000 0.0000 -0.0035 0.0000 2 0.00 0.60 0.00 0.00 0.00 0.00
0.0000 -0.0031 0.0000 0.0000 -0.0026 0.0000 2 1 0.00 4.00 0.00 0.00 0.00 0.00
0.0000 -0.0018 0.0000 0.0000 -0.0009 0.0000 2 0.00 4.00 0.00 0.00 0.00 0.00
0.0000 0.0000 0.0000 3 1 0.00 4.60 0.00 0.00 0.00 0.00
2 0.00 4.60 0.00 0.00 0.00 0.00
2 0.0000 0.0000 0.0000 0.0000 -0.0063 0.0000 4 1 0.00 7.24 0.00 0.00 0.00 0.00
0.0000 -0.0122 0.0000 0.0000 -0.0171 0.0000 2 0.00 7.24 0.00 0.00 0.00 0.00
0.0000 -0.0209 0.0000 0.0000 -0.0232 0.0000
0.0000 -0.0240 0.0000 0.0000 -0.0232 0.0000
0.0000 -0.0209 0.0000 0.0000 -0.0171 0.0000 ************** END OF LATEST ANALYSIS RESULT **************
0.0000 -0.0122 0.0000 0.0000 -0.0063 0.0000
0.0000 0.0000 0.0000
PARAMETER 1
3 0.0000 0.0000 0.0000 0.0000 -0.0073 0.0000 40. CODE BS5950
0.0000 -0.0140 0.0000 0.0000 -0.0197 0.0000 41. TRACK 2 ALL
0.0000 -0.0240 0.0000 0.0000 -0.0267 0.0000 42. BEAM 2 ALL
0.0000 -0.0276 0.0000 0.0000 -0.0267 0.0000 43. CHECK CODE ALL
0.0000 -0.0240 0.0000 0.0000 -0.0197 0.0000
0.0000 -0.0140 0.0000 0.0000 -0.0073 0.0000
0.0000 0.0000 0.0000 STAAD.Pro CODE CHECKING - (BSI )
***********************
4 0.0000 0.0000 0.0000 0.0000 -0.0114 0.0000
0.0000 -0.0220 0.0000 0.0000 -0.0310 0.0000 PROGRAM CODE REVISION V2.12_5950-1_2000
0.0000 -0.0378 0.0000 0.0000 -0.0421 0.0000
0.0000 -0.0435 0.0000 0.0000 -0.0421 0.0000
0.0000 -0.0378 0.0000 0.0000 -0.0310 0.0000
0.0000 -0.0220 0.0000 0.0000 -0.0114 0.0000
0.0000 0.0000 0.0000
MAX LOCAL DISP = 0.04351 AT 80.00
LOAD 4 L/DISP= 3677
************ END OF SECT DISPL RESULTS ***********
38.
PRINT MEMBER FORCES
S:\project\2608118a\eng\2007 AG structural works\ST54 - DESIGN FILES\STAAD\121211 Floor Joist\121211Pa gFeL O3O Ro fJ O7IST.anl S:\project\2608118a\eng\2007 AG structural works\ST54 - DESIGN FILES\STAAD\121211 Floor Joist\121211Pa gFeL O4O Ro fJ O7IST.anl
Tuesday, December 18, 2012, 09:52 PM Tuesday, December 18, 2012, 09:522 4P0M
************** END OF TABULATED RESULT OF DESIGN **************
ALL UNITS ARE - KN METE (UNLESS OTHERWISE NOTED)
MEMBER TABLE RESULT/ CRITICAL COND/ RATIO/
LOADING/ 44.
FINISH
FX MY MZ LOCATION
=======================================================================
*********** END OF THE STAAD.Pro RUN ***********
0.00 0.00 2.90 0.00
======================================================================= ************************************************************
MATERIAL DATA * For questions on STAAD.Pro, please contact *
Grade of steel = S 275 * Research Engineers Offices at the following locations *
Modulus of elasticity = 205 kN/mm2 * *
Design Strength (py) = 275 N/mm2 * Telephone Email *
* USA: +1 (714)974-2500 support@bentley.com *
SECTION PROPERTIES (units - cm) * CANADA +1 (905)632-4771 detech@odandetech.com *
Member Length = 160.00 * UK +44(1454)207-000 support@bentley.com *
Gross Area = 23.71 Net Area = 23.71 Eff. Area = 23.71 * NORWAY +47 67 57 21 30 staad@edr.no *
* SINGAPORE +65 6225-6158 support@bentley.com *
z-z axis y-y axis * INDIA +91(033)4006-2021 support@bentley.com *
Moment of inertia : 861.000 117.000 * JAPAN +81(03)5952-6500 eng-eye@crc.co.jp *
Plastic modulus : 134.000 45.600 * CHINA +86(411)8479-1166 support@bentley.com *
Elastic modulus : 114.800 22.414 * THAILAND +66(0)2645-1018/19 support@bentley.com *
Effective modulus : 134.000 45.600 * *
Shear Area : 13.500 9.750 * North America support@bentley.com *
* Europe support@bentley.com *
DESIGN DATA (units - kN,m) BS5950-1/2000 * Asia support@bentley.com *
Section Class : PLASTIC ************************************************************
z-z axis y-y axis
Moment Capacity : 36.9 9.2
Reduced Moment Capacity : 36.9 9.2
Shear Capacity : 222.8 160.9
BUCKLING CALCULATIONS (units - kN,m)
(axis nomenclature as per design code)
LTB Moment Capacity (kNm) and LTB Length (m): 30.31, 1.600
LTB Coefficients Associated Moments (kNm):
mLT = 1.00 : mx = 0.00 : my = 0.00 : myx = 0.00
Mlt = 2.90 : Mx = 0.00 : My = 0.00 : My = 0.00
CRITICAL
LOADS FOR EACH CLAUSE CHECK (units- kN,m):
CLAUSE RATIO
LOAD FX VY VZ MZ MY
BS-4.2.3-(Y) 0.045 4 - 7.2 - - -
BS-4.3.6 0.096 4 - 7.2 - 2.9 -
Torsion and deflections have not been considered in the design.
_________________________
S:\project\2608118a\eng\2007 AG structural works\ST54 - DESIGN FILES\STAAD\121211 Floor Joist\121211Pa gFeL O5O Ro fJ O7IST.anl S:\project\2608118a\eng\2007 AG structural works\ST54 - DESIGN FILES\STAAD\121211 Floor Joist\121211Pa gFeL O6O Ro fJ O7IST.anl