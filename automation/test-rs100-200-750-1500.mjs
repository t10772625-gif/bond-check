import assert from 'node:assert/strict';
import { parseDrawText, validate, buildIndex, matchBonds, extractDrawLinks, decodeBytes, expectedFor } from './prizebond-parser.mjs';

const T = (s) => s; // fixtures: real headers copied from the result files, bodies trimmed
const rows = (n, cols, start = 100000) => Array.from({ length: n }, (_, r) =>
  Array.from({ length: cols }, (_, c) => String(start + r * 1000 + c * 7)).join('\t')).join('\n');

function check(name, text, opts, exp) {
  const p = parseDrawText(text, opts);
  const got = { f: p.first.length, s: p.second.length, t: p.third.length, ph: p.placeholders };
  assert.deepEqual(got, exp.counts, `${name} counts ${JSON.stringify(got)}`);
  for (const [k, v] of Object.entries(exp.meta ?? {})) assert.equal(p.meta[k], v, `${name} meta.${k}`);
  if (exp.first) assert.deepEqual(p.first, exp.first, `${name} first`);
  if (exp.second) assert.deepEqual(p.second, exp.second, `${name} second`);
  console.log('ok  ', name);
  return p;
}

// ---- Rs100 ------------------------------------------------------------------------------------
check('rs100-53 (no third heading, "(1199 Prizes..)" declared, Held on date)',
`Draw Result of Rs. 100/- Denomination Student Welfare Prize Bonds â€“ 53rd Draw

First Prize of Rs. 700,000/-

124915

Second Prize of Rs. 200,000/- each

017336     505165      971442

53rd draw of Rs. 100/- Denomination Student Welfare Prize Bonds Held on 16-02-2026
at SBP BSC Karachi (1199 Prizes of Rs. 1,000/- each)

000322	035371	074441	119207	162531	200887
001265	036997	074919	119513	162533	201435
957688	957753	XXXXXX`, { denomination: 100 },
{ counts: { f: 1, s: 3, t: 14, ph: 1 }, meta: { drawNo: 53, denomination: 100, heldOn: '2026-02-16' }, first: ['124915'], second: ['017336', '505165', '971442'] });

const p53 = parseDrawText(`53rd Draw\nFirst Prize\n1\n`, { denomination: 100 });
assert.equal(expectedFor(100, 53).third, 1199); assert.equal(expectedFor(100, 50).third, 1696);

check('rs100-54 ("Third Prize of Rs.100/- each" typo, lowercase xxxxxx, 2-col tail)',
`Draw Result of Rs. 100/- Denomination Student Welfare Prize Bonds â€“ 54th Draw

First Prize of Rs. 700,000/-

847006

Second Prize of Rs. 200,000/- each

134391     186306     821652


Third Prize of Rs.100/- each

000318	035371	078826	116556	163239	204232
002926	035788	079245	116828	164172	204287


957191	996382
959380	xxxxxx`, { denomination: 100 }, { counts: { f: 1, s: 3, t: 15, ph: 1 }, meta: { drawNo: 54 }, first: ['847006'] });

check('rs100-50 ("Third prize Rs.1,000/- each", 12 columns)',
`Draw Result of Rs. 100/- Denomination Student Welfare Prize Bonds â€“ 50th Draw

First Prize of Rs. 700,000/-

268813

Second Prize of Rs. 200,000/- each

009914    298412     886501

Third prize Rs.1,000/- each



001282	038951	086294	125164	167097	206809	250674	286233	334805	384088	421593	460585
959990	xxxxxx`, { denomination: 100 }, { counts: { f: 1, s: 3, t: 13, ph: 1 }, meta: { drawNo: 50 } });

check('rs100-51 ("(1199 Prizes..)" only, trailing space after first prize heading)',
`DRAW RESULT OF RS. 100/- DENOMINATION STUDENT WELFARE PRIZE BONDS â€“ 51st DRAW

First Prize of Rs. 700,000/- 

991149

Second Prize of Rs. 200,000/- (each)

008228     397667     951818

(1199 Prizes of Rs.1,000/- each)

000181	031469	084582	125283	159382	197688	246236	283078	334040	383083	429399	469801
001287	038951	087014	125230	167386	207398	250949	287149	334987	385280	423262	462360`, { denomination: 100 },
{ counts: { f: 1, s: 3, t: 24, ph: 0 }, meta: { drawNo: 51 }, second: ['008228', '397667', '951818'] });

// ---- Rs200 (FIVE second prizes) ---------------------------------------------------------------
check('rs200-105 ("105th draw of Prize Bond", 1st/2nd/Third, date "on 16.03.2026")',
`105th draw of Prize Bond, Rs.200/- denomination at SBP (BSC) Faisalabad on 16.03.2026(Monday)

1st Prize of Rs. 750,000

591284

2nd Prize of Rs. 250,000

293000    811470    721418     473127      659859

Third Prize of Rs. 1250

000374	025101	046588	066488	090146	115607
000710	025844	047467	066697	090643	116295
913448	932326	952857	971036	995069	xxxxxx
919183	935830	956182	976213	999932	xxxxxx`, { denomination: 200 },
{ counts: { f: 1, s: 5, t: 22, ph: 2 }, meta: { drawNo: 105, denomination: 200, heldOn: '2026-03-16' }, first: ['591284'], second: ['293000', '811470', '721418', '473127', '659859'] });

check('rs200-107 (label-prefixed "01 Prize:\\t516806", "05 Prizes\\t...", 12 cols, "(2400 Prizes..)")',
`                    107th DRAW OF Rs.200/- DENOMINATION PREMIUM PRIZE BONDS 											
                          HELD ON 15-09-2026  AT SBP BSC Muzaffarabad											
											
			1st Prize:	Rs. 750,000/- 							
			01 Prize:	516806							
											
			2nd Prize	Rs. 250,000/- Each							
			05 Prizes	381066	425087	796229	799273	844138			
											
											
                                    (2400 Prizes of Rs.1250/- Each)											
										Page 1/4	
000133	025485	046388	068394	086765	104751	122953	141587	165309	186195	213479	239635
000215	025634	046525	069085	086889	105045	123062	141588	165819	187552	213559	239699
			
                          							Page  2/4	
773905	794878	812916	836898	860564	882845	905945	927687	947120	963337	978663	XXXXXX
774454	794982	814026	837451	862153	882956	906080	927752	947296	963959	979675	XXXXXX`, { denomination: 200 },
{ counts: { f: 1, s: 5, t: 46, ph: 2 }, meta: { drawNo: 107, heldOn: '2026-09-15' }, first: ['516806'], second: ['381066', '425087', '796229', '799273', '844138'] });
const v107 = validate(parseDrawText(`107th DRAW OF Rs.200/- DENOMINATION\n(2400 Prizes of Rs.1250/- Each)\n`, { denomination: 200 }));
assert.ok(!v107.warnings.some((w) => w.includes('declares')), 'declared TOTAL (2400) must not warn');

check('rs200-101 ("Rs 200 Denomination" without /-, "101st Draw")',
`Draw Result of Prize Bond Rs 200 Denomination 101st Draw

First Prize of Rs. 750,000

597355

Second Prize of Rs. 250,000

174102     433277     678705     692458     839404


Third Prize of Rs 1,250


001075	027951	055553	079885	102069	134333	157137	177313	204251	234467	256825
001087	028106	056400	080077	102095	135974	157642	177721	204328	234488	257358`, {},
{ counts: { f: 1, s: 5, t: 22, ph: 0 }, meta: { drawNo: 101, denomination: 200 } });

check('rs200-102 ("National Prize bond 102 Draw" - no ordinal suffix)',
`Draw Result of Rs. 200/- Denomination National Prize bond 102 Draw

First Prize of Rs. 750,000 each

774331

Second Prize of Rs. 250,000 each

097127    265610    464840    976082   978550


Third prize of Rs. 1250 each

000341	017977	039295	057427	075479	094073
000696	018181	040165	057632	076729	094324`, {},
{ counts: { f: 1, s: 5, t: 12, ph: 0 }, meta: { drawNo: 102, denomination: 200 } });

const p97 = check('rs200-97 (long preamble, prose with "second prize", numbers one per line)',
`STATE BANK OF PAKISTAN
SBP BANKING SERVICES CORPORATION (BANK)

                                                                                    MUZAFFARABAD	          Part-I
DRAW RESULT OF Rs.200/- DENOMINATION NATIONAL PRIZE BONDS-97th DRAW
The 97th Draw of Rs.200/- denomination National Prize Bonds was held today the 15th March, 2024 (Friday) at 9:00 a.m. at State Bank of Pakistan, SBP BSC (Bank), Muzaffarabad.
The winning numbers as mentioned below have been declared entitled to prizes. 2400 common numbers in all 165 (One Hundred and Sixty-Five) series mentioned above are entitled to prizes mentioned there against. For instance, the number, which is declared successful for the first prize, will get the first prize in each series. Similarly, the number for the second prize will get the second prize in each series and so on.


Following is the detail of prizes drawn on Rs. 200/- denomination National Prize Bonds: -

165 Prizes of Rs.750,000/- each 
01  Prize in each series
825  Prizes of Rs.250,000/- each
05  Prizes in each series
395,010 Prizes of Rs.1,250/- each
  2394  Prizes in each series
396,000 Total Prizes
2400 Prizes in each series

The following 2,400 common numbers were drawn from amongst numbers from 000001 to 999999.
 First Prize of Rs.750,000/- (each)
612132
Second Prize of Rs.250,000/- (each)

007796
018511
272618
312188
637049







p

(Muhammad Arshad Khan )
ASSISTANT CHIEF MANAGER (PBU)

										Continued on Part-II

Page: (1):											
97TH DRAW OF RS. 200/- DENOMINATION NATIONAL PRIZE BONDS											
"HELD AT MUZAFFARABAD ON 15TH MARCH, 2024"											
"(2,394 PRIZES OF RS. 1,250/- EACH)"											
PART-II											
000179	021500	044215	069029	088862	110966	137943	157881	182316	208757	230726	
000540	021935	044796	069244	089900	110966	138536	158262	184210	209093	232229	`, { denomination: 200 },
{ counts: { f: 1, s: 5, t: 22, ph: 0 }, meta: { drawNo: 97, denomination: 200 }, first: ['612132'], second: ['007796', '018511', '272618', '312188', '637049'] });
assert.equal(p97.declaredThird, 2394);

check('rs200-98 ("Draw No.98th", "Rs.200/- PRIZE BOND", Date:20/06/2024, dashes)',
`                       DRAW OF Rs.200/- PRIZE BOND

		        HELD AT RAWALPINDI
Draw No.98th				

Series:	Common Draw					Date:20/06/2024

----------------------------------------------------------------------------------

First Prize of Rs.750,000/-

605238

----------------------------------------------------------------------------------

Second Prize of Rs.Rs.250,000/- each.


272785	288053	542096	966178	985324

--------------------------------------------------------------------------------------	
										
98TH DRAW OF RS. 200/- DENOMINATION NATIONAL PRIZE BONDS HELD AT RAWALPINDI ON 
20TH JUNE, 2024 (2,394 PRIZES OF RS. 1,250/- EACH)

000025	019296	041085	065200	095830	118151	139329	164056	180702	201720	225038
000512	020315	041830	065309	096395	118168	140155	164097	180814	202382	225217`, {},
{ counts: { f: 1, s: 5, t: 22, ph: 0 }, meta: { drawNo: 98, denomination: 200, heldOn: '2024-06-20' } });

// ---- Rs750 ------------------------------------------------------------------------------------
check('rs750-98 (Hyderabad: "1696 Prize(s) of 9,300/-", dashes, no DENOMINATION word)',
`                     DRAW OF Rs.750/- PRIZE BOND

		        Held At Hyderabad
Draw No:98th
Series:	Common Draw					Date:15/04/2024
----------------------------------------------------------------------------------


First Prize of Rs.1,500,000/-

900286
----------------------------------------------------------------------------------

Second Prize of Rs.Rs.500,000/- each.

134617	197462	314256

----------------------------------------------------------------------------------	
						
1696 Prize(s) of 9,300/-  Each


000974	034527	060737	087744	116100	146569	179589	211422	249951	280529	311481
001057	034901	061372	087789	116146	147092	180737	212281	249978	280903	312295
980631	xxxxxx`, {},
{ counts: { f: 1, s: 3, t: 23, ph: 1 }, meta: { drawNo: 98, denomination: 750, heldOn: '2024-04-15' }, first: ['900286'] });

check('rs750-102 ("1696 Prizes of 9300/- each", no heading)',
`DRAW RESULT OF RS. 750/- DENOMINATION NATIONAL PRIZE BONDS-102nd DRAW

First Prize of Rs. 1,500,000 /-

261227

Second Prize of Rs.500,000/-each

204763     413549     992747

1696 Prizes of 9300/- each

000670	027553	055075	089196	120046	155383	182747	212175	244891	274822	302873
000841	027828	055600	089637	120103	155558	183696	213219	245187	275544	304290`, {},
{ counts: { f: 1, s: 3, t: 22, ph: 0 }, meta: { drawNo: 102, denomination: 750 }, second: ['204763', '413549', '992747'] });

// ---- Rs1500 (5-column grids!) -----------------------------------------------------------------
check('rs1500-105 ("Third Prize 1696 Prizes of Rs.18,500/- Each}", 5 columns)',
`DRAW RESULT OF RS.1500/- DENOMINATION NATIONAL PRIZE BONDS - 105TH DRAW

First Prize of Rs. 3,000,000/- 

429148

Second Prize of Rs. 1,000,000/- (each)

430347      591133       628300

Third Prize 1696 Prizes of Rs.18,500/- Each}

000105	029142	061085	093191	123595
000595	029447	061547	094190	124527
983705	983767	983799	XXXXX	XXXXX`, {},
{ counts: { f: 1, s: 3, t: 13, ph: 2 }, meta: { drawNo: 105, denomination: 1500 } });

check('rs1500-101 (quoted header, no third heading, 5 cols, quoted "(1696 Prizes..)")',
`"101st  DRAW OF RS.1,500/- DENOMINATION NATIONAL PRIZE BONDS"										
HELD ON 17-02-2025 AT SBP BSC MULTAN

First Prize of Rs. 3,000,000/-
402432

Second Prize of Rs. 1,000,000 each.
543452   764165    814653
										
"(1696 Prizes of Rs.18,500/- each)"										
										
000222	033530	056693	079715	112543
000526	033712	056737	082924	112794`, {},
{ counts: { f: 1, s: 3, t: 10, ph: 0 }, meta: { drawNo: 101, denomination: 1500, heldOn: '2025-02-17' } });

// ---- the traps themselves ---------------------------------------------------------------------
// 1) unknown denomination (premium): fallback line rule must not push 5 second-prize numbers into third
let p = parseDrawText(`First Prize\n111111\nSecond Prize\n222222 333333 444444 555555 666666\n000010 000020 000030 000040 000050\n`, { denomination: 7500 });
assert.deepEqual([p.first.length, p.second.length, p.third.length], [1, 5, 5]);
assert.equal(validate(p).ok, false); assert.match(validate(p).issues[0], /no prize structure/);
// 2) count-based switch with a typo'd short number inside second prize (the 7447 case), no PART II heading
p = parseDrawText(`First Prize\n347425\nSecond Prize\n7447 827353 876615\n001081 027485 061481\n`, { denomination: 750 });
assert.deepEqual([p.second.length, p.suspects.length, p.third.length], [2, 1, 3]);
assert.equal(p.suspects[0].candidate, '007447');
assert.ok(validate(p, { first: 1, second: 3, third: 3 }).issues.some((i) => i.includes('7447')));
const r = matchBonds([{ id: 1, number: '007447' }, { id: 2, number: '001081' }], buildIndex(p), p);
assert.deepEqual([r.wins.map((w) => w.bond.id), r.possible.map((x) => x.bond.id)], [[2], [1]]);
// 3) header disagreement and date mismatch are warnings, never silent
p = parseDrawText(`107th DRAW OF Rs.200/- DENOMINATION PREMIUM PRIZE BONDS\nHELD ON 15-09-2026\nFirst Prize\n1\n`, { denomination: 200, listDate: '2026-09-16' });
assert.ok(p.warnings.some((w) => w.includes('list page says 2026-09-16')));
p = parseDrawText(`DRAW OF Rs.100/- DENOMINATION 53rd Draw\nFirst Prize\n1\n`, { denomination: 200 });
assert.ok(p.warnings.some((w) => w.includes('header says Rs100')));
console.log('ok   traps');
console.log('ALL TESTS PASSED');
