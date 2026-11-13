/**
 * DIXPIX QUANTITATIVE ENGINE — CORE MATH MODULES
 * Modules 1-12: Efficiency, EV & Staking, Key Number Spreads, Biophysical & Fibonacci Synthesis
 */

const GOLDEN_RATIO_PHI = 1.6180339887;
const PI_OVER_PHI_HFA = 1.9416110252;
const GOLDEN_PLAY_SCALER = 38.5145;
const LOGISTIC_K_TIGHT = GOLDEN_RATIO_PHI / (4.0 * Math.PI); // ~0.12875903

const FIBONACCI_TIERS = {
    TIER_1: 34,
    TIER_2: 21,
    TIER_3: 13,
    TIER_4: 8,
    SUM_F: 76
};

// ==========================================
// MODULE 1: IMPLIED BREAK-EVEN & VIG-FREE PROBABILITY
// ==========================================
function calcImpliedProbability(americanOdds) {
    if (americanOdds < 0) {
        return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
    } else {
        return 100 / (americanOdds + 100);
    }
}

function calcVigFreeProbability(oddsA, oddsB) {
    const probA = calcImpliedProbability(oddsA);
    const probB = calcImpliedProbability(oddsB);
    const trueProbA = probA / (probA + probB);
    const trueProbB = probB / (probA + probB);
    
    return {
        impliedA: probA,
        impliedB: probB,
        trueProbA: trueProbA,
        trueProbB: trueProbB
    };
}

// ==========================================
// MODULE 2: EXPECTED VALUE & QUARTER-KELLY SIZING
// ==========================================
function americanToDecimal(americanOdds) {
    if (americanOdds > 0) {
        return (americanOdds / 100) + 1;
    } else {
        return (100 / Math.abs(americanOdds)) + 1;
    }
}

function calcExpectedValueAndKelly(modelProb, americanOdds) {
    const decimalOdds = americanToDecimal(americanOdds);
    const b = decimalOdds - 1;
    
    const expectedValue = (modelProb * b) - (1 - modelProb);
    const fullKelly = ((modelProb * b) - (1 - modelProb)) / b;
    const quarterKelly = fullKelly > 0 ? (fullKelly * 0.25) : 0;
    
    return {
        evPercentage: expectedValue * 100,
        quarterKellyStakePct: quarterKelly * 100
    };
}

// ==========================================
// MODULE 3: SPREAD POINT-BUY / SELL MARGINAL EFFICIENCY RATIO
// ==========================================
function calcSpreadMER(baseTrueProb, altTrueProb, baseOdds, altOdds) {
    const baseImplied = calcImpliedProbability(baseOdds);
    const altImplied = calcImpliedProbability(altOdds);
    
    const trueProbGain = altTrueProb - baseTrueProb;
    const juiceTax = altImplied - baseImplied;
    
    if (juiceTax === 0) return { merRatio: 0, isApproved: false };
    
    const mer = trueProbGain / juiceTax;
    
    return {
        merRatio: mer,
        isApproved: mer > 1.15
    };
}

// ==========================================
// MODULE 4: DISCRETE COUNT PROPS (POISSON & NEGATIVE BINOMIAL)
// ==========================================
function factorial(n) {
    if (n <= 1) return 1;
    let res = 1;
    for (let i = 2; i <= n; i++) res *= i;
    return res;
}

function logGamma(z) {
    const g = 7;
    const p = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507343278686905,
        -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
    ];
    if (z < 0.5) {
        return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
    }
    z -= 1;
    let x = p[0];
    for (let i = 1; i < g + 2; i++) {
        x += p[i] / (z + i);
    }
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function calcPoissonPMF(lambda, k) {
    if (lambda <= 0 || k < 0) return 0;
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function calcPoissonOverProb(lambda, thresholdLine) {
    const minK = Math.floor(thresholdLine) + 1;
    let cdf = 0;
    for (let k = 0; k < minK; k++) {
        cdf += calcPoissonPMF(lambda, k);
    }
    return Math.max(0, Math.min(1, 1 - cdf));
}

function calcNegBinPMF(mu, r, x) {
    if (mu <= 0 || r <= 0 || x < 0) return 0;
    const logComb = logGamma(x + r) - logGamma(x + 1) - logGamma(r);
    const probTerm = r * Math.log(r / (r + mu)) + x * Math.log(mu / (r + mu));
    return Math.exp(logComb + probTerm);
}

function calcNegBinOverProb(mu, r, thresholdLine) {
    const minX = Math.floor(thresholdLine) + 1;
    let cdf = 0;
    for (let x = 0; x < minX; x++) {
        cdf += calcNegBinPMF(mu, r, x);
    }
    return Math.max(0, Math.min(1, 1 - cdf));
}

// ==========================================
// MODULE 5: CONTINUOUS YARDAGE PROPS (GAMMA SURVIVAL)
// ==========================================
function lowerIncompleteGammaRatio(alpha, x) {
    if (x <= 0) return 0;
    const eps = 1e-10;
    const maxIter = 200;

    if (x < alpha + 1) {
        let ap = alpha;
        let sum = 1.0 / alpha;
        let del = sum;
        for (let n = 1; n <= maxIter; n++) {
            ap += 1;
            del *= x / ap;
            sum += del;
            if (Math.abs(del) < Math.abs(sum) * eps) {
                return sum * Math.exp(-x + alpha * Math.log(x) - logGamma(alpha));
            }
        }
    } else {
        let b = x + 1 - alpha;
        let c = 1 / 1e-30;
        let d = 1 / b;
        let h = d;
        for (let i = 1; i <= maxIter; i++) {
            const an = -i * (i - alpha);
            b += 2;
            d = an * d + b;
            if (Math.abs(d) < 1e-30) d = 1e-30;
            c = b + an / c;
            if (Math.abs(c) < 1e-30) c = 1e-30;
            d = 1 / d;
            const del = d * c;
            h *= del;
            if (Math.abs(del - 1.0) < eps) break;
        }
        const upperQ = h * Math.exp(-x + alpha * Math.log(x) - logGamma(alpha));
        return 1.0 - upperQ;
    }
    return 0.5;
}

function calcGammaSurvivalProb(meanMu, varianceSigma2, milestoneLine) {
    if (meanMu <= 0 || varianceSigma2 <= 0) return { alpha: 0, beta: 0, trueOverProb: 0.5, trueUnderProb: 0.5 };
    if (milestoneLine <= 0) return { alpha: 0, beta: 0, trueOverProb: 1, trueUnderProb: 0 };

    const alpha = Math.pow(meanMu, 2) / varianceSigma2;
    const beta = varianceSigma2 / meanMu;
    const scaledX = milestoneLine / beta;

    const cdf = lowerIncompleteGammaRatio(alpha, scaledX);
    const survivalProb = Math.max(0, Math.min(1, 1.0 - cdf));

    return {
        alpha: alpha,
        beta: beta,
        trueOverProb: survivalProb,
        trueUnderProb: 1.0 - survivalProb
    };
}

// ==========================================
// MODULE 6: PROP ALT-LINE ARBITRAGE EFFICIENCY
// ==========================================
function calcPropAltMER(baseTrueProb, altTrueProb, baseOdds, altOdds) {
    const baseBE = calcImpliedProbability(baseOdds);
    const altBE = calcImpliedProbability(altOdds);

    const deltaTrueProb = Math.abs(altTrueProb - baseTrueProb);
    const deltaBE = Math.abs(altBE - baseBE);

    if (deltaBE === 0) return { merProp: 0, isAuthorized: false };

    const merProp = deltaTrueProb / deltaBE;

    return {
        deltaTrueProb: deltaTrueProb,
        deltaBreakEven: deltaBE,
        merProp: merProp,
        isAuthorized: merProp > 1.15
    };
}

// ==========================================
// MODULE 7: BAROMETRIC AIR DENSITY & BALLISTIC DRAG
// ==========================================
function calcBarometricBallistics(envPayload) {
    if (envPayload.is_dome) {
        return {
            airDensityRho: 1.204,
            dragForceFd: 0,
            fgRangeShiftYards: 1.15,
            deepPassShiftYards: 0.75,
            passGameModifierYards: 2.52
        };
    }

    const Rd = 287.058;
    const Rv = 461.495;
    const rho0 = 1.225;

    // Supports both temperature_f (from scraper.py) and temp_kelvin
    const T = envPayload.temp_kelvin !== undefined
        ? envPayload.temp_kelvin
        : (envPayload.temperature_f !== undefined ? ((envPayload.temperature_f - 32) * 5 / 9) + 273.15 : 288.15);

    const pTotalPa = (envPayload.pressure_hpa || 1013.25) * 100;
    const pvPa = (envPayload.vapor_pressure || 10.0) * 100;
    const pdPa = Math.max(0, pTotalPa - pvPa);

    const rho = (pdPa / (Rd * T)) + (pvPa / (Rv * T));

    const vRel = 27.0;
    const Cd = 0.055;
    const areaCross = 0.024;
    const dragForceFd = 0.5 * rho * Math.pow(vRel, 2) * Cd * areaCross;

    // Supports both wind_mph (from scraper.py) and wind_speed_mph
    const windSpeed = envPayload.wind_mph !== undefined ? envPayload.wind_mph : (envPayload.wind_speed_mph || 0);
    const windType = envPayload.wind_direction_head_cross || "cross";
    
    let wHead = 0;
    let wCross = 0;
    if (windType === "head") wHead = windSpeed;
    else if (windType === "tail") wHead = -windSpeed;
    else wCross = windSpeed;

    const fgRangeShift = -0.45 * ((rho - rho0) / 0.01) - (0.38 * wHead) - (0.22 * Math.abs(wCross));
    const deepPassShift = fgRangeShift * 0.65;
    const passGameMod = -1.20 * ((rho - rho0) / 0.01) - (Math.max(0, windSpeed - 10) * 1.50);

    return {
        airDensityRho: Number(rho.toFixed(4)),
        dragForceFd: Number(dragForceFd.toFixed(4)),
        fgRangeShiftYards: Number(fgRangeShift.toFixed(2)),
        deepPassShiftYards: Number(deepPassShift.toFixed(2)),
        passGameModifierYards: Number(passGameMod.toFixed(2))
    };
}

// ==========================================
// MODULE 8: CIRCADIAN FATIGUE PENALTY & REST STRAIN
// ==========================================
function calcCircadianStrain(circPayload, kickoffLocalHour) {
    const tzShift = circPayload.away_tz_shift || 0;
    const absTz = Math.abs(tzShift);
    const omegaDir = tzShift > 0 ? 1.35 : (tzShift < 0 ? 0.85 : 1.0);
    
    const travelMiles = circPayload.away_travel_miles || 0;
    const restDelta = circPayload.rest_differential_days || 0;
    const mnfShortFlag = circPayload.short_week_flag ? 1.0 : 0.0;
    const dAccl = circPayload.acclimation_days || 1;

    const bodyClockKickoff = (kickoffLocalHour || 13) - tzShift;
    const troughPenalty = Math.max(0, 13 - bodyClockKickoff);

    const alpha = 0.45, gamma = 0.35, beta = 0.30;
    const phiCirc = alpha * (absTz * omegaDir * Math.exp(-gamma * dAccl)) + (beta * troughPenalty);
    const csi = (0.40 * absTz * omegaDir) + (0.35 * (travelMiles / 1000)) - (0.50 * restDelta) + mnfShortFlag;

    return {
        phiCircadianPenalty: Number(phiCirc.toFixed(3)),
        circadianStrainIndex: Number(csi.toFixed(3)),
        bodyClockKickoffHour: bodyClockKickoff
    };
}

// ==========================================
// MODULE 9: FULL-GAME FAIR MARGIN & LOGISTIC POINT-GAP PROBABILITY
// ==========================================
function calcFullGameFairMargin(gameData, phiCirc, psiCoupled11_12 = 0, mode = "tip") {
    const hfaBase = gameData.hfa_base !== undefined ? gameData.hfa_base : PI_OVER_PHI_HFA;

    const home = (gameData.team_telemetry && gameData.team_telemetry.home) || {};
    const away = (gameData.team_telemetry && gameData.team_telemetry.away) || {};

    const epaDiff = (away.net_epa_per_play || 0) - (home.net_epa_per_play || 0);
    const deltaQB = (away.qb_replacement_delta || 0) - (home.qb_replacement_delta || 0);
    const deltaTOReg = (away.turnover_reg_delta || 0) - (home.turnover_reg_delta || 0);

    const activePsi = (mode === "tip") ? 0 : psiCoupled11_12;
    const effectivePlays = GOLDEN_PLAY_SCALER;

    const fairMarginHomeSpread = (
        (effectivePlays * epaDiff) + deltaQB + deltaTOReg - hfaBase - phiCirc + activePsi
    );

    return {
        fairHomeSpread: Number(fairMarginHomeSpread.toFixed(2)),
        epaContribution: Number((effectivePlays * epaDiff).toFixed(2)),
        activeCoupledOverlay: Number(activePsi.toFixed(3))
    };
}

function calcPointGapWinProb(pointGap) {
    const prob = 1.0 / (1.0 + Math.exp(-LOGISTIC_K_TIGHT * pointGap));
    return Math.max(0.01, Math.min(0.99, prob));
}

// ==========================================
// MODULE 10: 30% PROFIT BOOST COMPOUND PARLAY EV
// ==========================================
function calcProfitBoostParlayEV(legsArray, boostMultiplier = 1.30) {
    if (!legsArray || legsArray.length === 0) {
        return { dRaw: 1, dBoost: 1, trueParlayProb: 0, evBoostPct: 0 };
    }

    let dRaw = 1.0;
    let pTrueParlay = 1.0;

    for (let i = 0; i < legsArray.length; i++) {
        const dec = americanToDecimal(legsArray[i].americanOdds);
        dRaw *= dec;
        pTrueParlay *= legsArray[i].trueProb;
    }

    const dBoost = 1.0 + (boostMultiplier * (dRaw - 1.0));
    const evBoost = (pTrueParlay * dBoost) - 1.0;

    return {
        dRaw: Number(dRaw.toFixed(3)),
        dBoost: Number(dBoost.toFixed(3)),
        trueParlayProb: Number((pTrueParlay * 100).toFixed(2)),
        evBoostPct: Number((evBoost * 100).toFixed(2))
    };
}

// ==========================================
// MODULE 11: BIOPHYSICAL MASS DENSITY & CLOSING MULTIPLIERS
// ==========================================
function calcBiophysicalMassLoad(envPayload, homeTelemetry, playerMassKg = 95.0, fH2O = 0.62, mode = "unsolicited", intensitySlider = 0.0) {
    const h = envPayload.elevation_m || 0;
    const Re = 6371000;
    const gSea = 9.80665;

    const gAlt = gSea * Math.pow(Re / (Re + h), 2);
    const deltaG = gAlt - gSea;

    const rhoH2O = 997.0;
    const rhoLean = 1100.0;
    const fLean = 1.0 - fH2O - 0.015;
    const traceSum = (0.00006 / 7874) + (0.0005 / 1738) + (0.012 / 1550) + (0.002 / 862) + (0.0015 / 968);
    
    const ballistics = calcBarometricBallistics(envPayload);
    const rhoAirH = ballistics.airDensityRho;

    const invBaseDensity = (fH2O / rhoH2O) + (fLean / rhoLean) + traceSum;
    const rhoPlayerH = (1.0 / invBaseDensity) - rhoAirH;
    const rhoPlayer0 = (1.0 / invBaseDensity) - 1.225;

    const traceGammaSum = 0.014;
    const deltaFgBio = playerMassKg * (fH2O + traceGammaSum) * deltaG;

    const pO2RatioDrop = 1.0 - Math.exp(-h / 8500);
    const hypoxicTerm = 1.45 * pO2RatioDrop;

    const eta1 = 100.0, eta2 = 10.0, eta3 = 2.5;
    const phiBioRaw = (eta1 * (deltaFgBio / (playerMassKg * gSea))) + 
                      (eta2 * ((rhoPlayerH / rhoPlayer0) - 1.0)) + 
                      (eta3 * hypoxicTerm);

    // Distinct scaling across all 3 modes + DaVinci slider reactivity
    const rankPct = homeTelemetry.closing_rank_pct || 0.5;
    const winStreak = homeTelemetry.active_win_streak || 0;
    let closingMultiplier = 0.382; // "tip" baseline

    if (mode === "unsolicited") {
        closingMultiplier = (rankPct >= 0.53) ? 0.786 : 0.618;
    } else if (mode === "davinci") {
        const baseDavinci = (rankPct >= 0.53 && winStreak >= 2) ? 1.618 : ((rankPct >= 0.53) ? 1.0 : 0.618);
        closingMultiplier = Number((baseDavinci * (1.0 + (intensitySlider * 0.35))).toFixed(3));
    }

    const phiBioAdjusted = phiBioRaw * closingMultiplier;

    return {
        rhoPlayerDensity: Number(rhoPlayerH.toFixed(2)),
        localGravityG: Number(gAlt.toFixed(5)),
        closingMultiplier: closingMultiplier,
        phiBioScore: Number(phiBioAdjusted.toFixed(4))
    };
}

// ==========================================
// MODULE 12: TURNOVER VALUE & EXPECTED POINTS MATRIX
// ==========================================
function calcTurnoverEPAMatrix(teamTelemetry, league = "NFL", mode = "unsolicited", intensitySlider = 0.0) {
    const N = (league === "NCAA") ? 138 : 32;
    
    const homeRankPct = teamTelemetry.home.closing_rank_pct !== undefined 
        ? teamTelemetry.home.closing_rank_pct 
        : 1.0 - (((teamTelemetry.home.closing_rank || 16) - 1) / (N - 1));
        
    const awayRankPct = teamTelemetry.away.closing_rank_pct !== undefined 
        ? teamTelemetry.away.closing_rank_pct 
        : 1.0 - (((teamTelemetry.away.closing_rank || 16) - 1) / (N - 1));

    // Distinct weights across "tip", "unsolicited", and "davinci" + slider
    let home4QWeight = 0.382;
    let away4QWeight = 0.382;

    if (mode === "unsolicited") {
        home4QWeight = homeRankPct >= 0.53 ? 0.786 : 0.618;
        away4QWeight = awayRankPct >= 0.53 ? 0.786 : 0.618;
    } else if (mode === "davinci") {
        const sliderScale = 1.0 + (intensitySlider * 0.35);
        home4QWeight = (homeRankPct >= 0.53 ? 1.618 : 0.618) * sliderScale;
        away4QWeight = (awayRankPct >= 0.53 ? 1.618 : 0.618) * sliderScale;
    }

    const baseEPConv = 3.85;
    const homeOppRzFactor = 1.0 - (teamTelemetry.away.opp_rz_dvoa || 0);
    const awayOppRzFactor = 1.0 - (teamTelemetry.home.opp_rz_dvoa || 0);

    const homeTovEPA = baseEPConv * homeOppRzFactor * ((0.382 * homeRankPct) + (home4QWeight * homeRankPct));
    const awayTovEPA = baseEPConv * awayOppRzFactor * ((0.382 * awayRankPct) + (away4QWeight * awayRankPct));

    const netTovEPADiff = homeTovEPA - awayTovEPA;

    return {
        homeRankPercentile: Number(homeRankPct.toFixed(3)),
        awayRankPercentile: Number(awayRankPct.toFixed(3)),
        homeTovEPA: Number(homeTovEPA.toFixed(3)),
        awayTovEPA: Number(awayTovEPA.toFixed(3)),
        netTurnoverEPA: Number(netTovEPADiff.toFixed(3))
    };
}

// ==========================================
// COUPLED MODULE 11 & 12 ROOTED INTERACTION (PSI_11,12)
// ==========================================
function calcCoupledInteractionPsi(phiBio, epaTov, intensitySlider = 0.0) {
    const sumVal = phiBio + epaTov;
    const sign = sumVal > 0 ? 1 : (sumVal < 0 ? -1 : 0);
    const rootProduct = Math.sqrt(Math.abs(phiBio * epaTov));
    
    // Smooth continuous scaling across negative and positive slider positions
    const scalar = 1.0 + (intensitySlider * 0.618);
    const psi = sign * rootProduct * scalar;

    return Number(psi.toFixed(4));
}

// ==========================================
// MASTER EQUATION: AGGREGATE FIBONACCI PROBABILITY (OMEGA_FIB & P_AGG)
// ==========================================
function calcMasterFibonacciAggregate(moduleScores, fibLookupFn = 13, intensitySlider = 0) {
    const m = moduleScores;
    
    const tier1 = FIBONACCI_TIERS.TIER_1 * ((m.m1 || 0) + (m.m5 || 0) + (m.m7 || 0));
    const tier2 = FIBONACCI_TIERS.TIER_2 * ((m.m6 || 0) + (m.m10 || 0) + (m.m12 || 0));
    const tier3 = FIBONACCI_TIERS.TIER_3 * ((m.m2 || 0) + (m.m3 || 0) + (m.m11 || 0));
    const tier4 = FIBONACCI_TIERS.TIER_4 * ((m.m4 || 0) + (m.m8 || 0));

    const omegaFib = (tier1 + tier2 + tier3 + tier4) / FIBONACCI_TIERS.SUM_F;
    const baseLogisticProb = 1.0 / (1.0 + Math.exp(-GOLDEN_RATIO_PHI * omegaFib));

    const volatilityMultiplier = 1.0 + ((fibLookupFn / FIBONACCI_TIERS.SUM_F) * intensitySlider);
    const pAgg = Math.max(0.01, Math.min(0.99, baseLogisticProb * volatilityMultiplier));

    return {
        omegaFibScore: Number(omegaFib.toFixed(4)),
        lockedObjectiveProb: Number((baseLogisticProb * 100).toFixed(2)),
        liveAdjustedProb: Number((pAgg * 100).toFixed(2))
    };
}
