STAAD SPACE DXF IMPORT OF DRAWING2.DXF 4 0.0000 0.0000 0.0000 0.0000 -0.0018 -0.0003
INPUT FILE: 20120627 PIPE SLEEPER 026-028.STD 5 0.0000 0.0000 0.0000 0.0000 -0.0018 -0.0005
START JOB INFORMATION 2 3 0.0000 0.0000 0.0000 0.0000 0.0013 0.0003
ENGINEER DATE 27-JUN-12 4 0.0000 0.0000 0.0000 0.0000 0.0018 0.0003
END JOB INFORMATION 5 0.0000 0.0000 0.0000 0.0000 0.0018 0.0005
INPUT WIDTH 79
UNIT METER KN
JOINT COORDINATES ************** END OF LATEST ANALYSIS RESULT **************
1 31.1365 0 -27.5421; 2 36.8665 0 -27.5421
MEMBER INCIDENCES
1 1 2 46.
PRINT MEMBER FORCES ALL
11.
DEFINE MATERIAL START
ISOTROPIC CONCRETE
E 2.17185E+007
POISSON 0.17 MEMBER END FORCES STRUCTURE TYPE = SPACE
DENSITY 23.5616 -----------------
ALPHA 1E-005 ALL UNITS ARE -- KN METE (LOCAL )
DAMP 0.05
END DEFINE MATERIAL MEMBER
LOAD JT AXIAL SHEAR-Y SHEAR-Z TORSION MOM-Y MOM-Z
MEMBER PROPERTY AMERICAN
1 PRIS YD 1.64 ZD 0.4
21.
CONSTANTS
MATERIAL CONCRETE ALL 1 3 1 0.00 390.47 -89.67 0.00 0.00 0.00
23.
SUPPORTS 2 0.00 390.47 -89.67 0.00 0.00 0.00
1 PINNED 4 1 0.00 390.47 -125.54 0.00 0.00 0.00
2 FIXED BUT KMX 0.0001 KMY 0.0001 KMZ 0.0001 2 0.00 390.47 -125.54 0.00 0.00 0.00
**************************** DEAD
LOAD ***************************** 5 1 0.00 546.66 -125.54 0.00 0.00 0.00
27.
LOAD 1
LOADTYPE NONE TITLE DL 2 0.00 546.66 -125.54 0.00 0.00 0.00
SELFWEIGHT Y -1
MEMBER
LOAD
1 UNI GY -120.833 ************** END OF LATEST ANALYSIS RESULT **************
**************************** FRICTIONAL
LOAD *****************************
32.
LOAD 2
LOADTYPE NONE TITLE FL
MEMBER
LOAD 47. START CONCRETE DESIGN
1 UNI GZ 31.3 48. CODE CP65
*************
LOAD COMBINATION - SERVICE ********* PROGRAM CODE REVISION V1.0_CP65/1
36.
LOAD COMB 3 1.0DL+1.0FL 49. DESIGN BEAM ALL
1 1.0 2 1.0
************
LOAD COMBINATION - ULTIMATE ********
39.
LOAD COMB 4 1.0DL+1.4FL ====================================================================
1 1.0 2 1.4
41.
LOAD COMB 5 1.4DL+1.4FL B E A M N O. 1 D E S I G N R E S U L T S - FLEXURE
1 1.4 2 1.4
43.
PERFORM ANALYSIS LEN - 5730. mm FY - 460. FC - 30. SIZE - 400. X 1640. mm
LEVEL HEIGHT BAR INFO FROM TO ANCHOR
mm mm mm STA END
P R O B L E M S T A T I S T I C S -------------------------------------------------------------------
-----------------------------------
1 33. 6- 16 MM 0. 5730. YES YES
NUMBER OF JOINTS/MEMBER+ELEMENTS/
SUPPORTS = 2/ 1/ 2
SOLVER USED IS THE IN-CORE ADVANCED SOLVER B E A M N O. 1 D E S I G N R E S U L T S - SHEAR
C:\YEAR 2012\NIK\JRC\ST33 - New Pipe Bridge\20120627 Comments from HDEC\STAADPro Model\20120627 PIPE SLEEPPEaRg e0 216 -o0f2 83.anl C:\YEAR 2012\NIK\JRC\ST33 - New Pipe Bridge\20120627 Comments from HDEC\STAADPro Model\20120627 PIPE SLEEPPEaRg e0 226 -o0f2 83.anl
317
Thursday, June 28, 2012, 10:47 AM
PROVIDE SHEAR LINKS AS FOLLOWS
----------------------------------------------------------------
FROM - TO  MAX. SHEAR
LOAD  LINKS  NO.  SPACING C/C
-----------------------------------------------------------
END 1 2387 mm  546.7 kN  5  8 mm  12  217 mm
3342 END 2  546.7 kN  5  8 mm  12  217 mm
----------------------------------------------------------------
********************END OF BEAM DESIGN**************************
END CONCRETE DESIGN
51.
FINISH
*********** END OF THE STAAD.Pro RUN ***********
************************************************************
* For questions on STAAD.Pro, please contact *
* Research Engineers Offices at the following locations *
* *
* Telephone Email *
* USA: +1 (714)974-2500 support@bentley.com *
* CANADA +1 (905)632-4771 detech@odandetech.com *
* UK +44(1454)207-000 support@bentley.com *
* NORWAY +47 67 57 21 30 staad@edr.no *
* SINGAPORE +65 6225-6158 support@bentley.com *
* INDIA +91(033)4006-2021 support@bentley.com *
* JAPAN +81(03)5952-6500 eng-eye@crc.co.jp *
* CHINA +86(411)8479-1166 support@bentley.com *
* THAILAND +66(0)2645-1018/19 support@bentley.com *
* *
* North America support@bentley.com *
* Europe support@bentley.com *
* Asia support@bentley.com *
************************************************************
C:\YEAR 2012\NIK\JRC\ST33 - New Pipe Bridge\20120627 Comments from HDEC\STAADPro Model\20120627 PIPE SLEEPPEaRg e0 236 -o0f2 83.anl