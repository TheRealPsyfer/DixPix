/**
 * DIXPIX QUANTITATIVE ENGINE — PHASE 4B: BRIDGE & UI CONTROLLER
 * Polls ./data.json every 5s, runs the 12-module math engine, and repaints all DOM panels.
 */

const AppState = {
    rawPayload: null,
    lastDataHash: "",
    activeMode: "tip",        // "tip" | "unsolicited" | "davinci"
    intensitySlider: 0.0,     // -1.618 to +1.618
    filters: {
        nfl: true,
        ncaa: true
    },
    selectedParlayLegs: new Set(),
    processedGames: [],
    processedProps: []
};

const openCardMemory = new Set();

// ==========================================
// 1. INITIALIZATION & EVENT LISTENERS
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    bindUIControls();
    pollDataFeed();
    setInterval(pollDataFeed, 5000);
});

function bindUIControls() {
    const modeRadios = {
        "mode-tip": "tip",
        "mode-unsolicited": "unsolicited",
        "mode-davinci": "davinci"
    };

    Object.keys(modeRadios).forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("change", (e) => {
                if (e.target.checked) {
                    AppState.activeMode = modeRadios[id];
                    recalculateAndRenderAll();
                }
            });
        }
    });

    // DaVinci Slider: live updates without closing open cards
    document.addEventListener("input", (e) => {
        if (e.target && e.target.id === "davinci-intensity-slider") {
            const readout = document.getElementById("davinci-readout");
            const val = parseFloat(e.target.value) || 0.0;
            if (readout) {
                readout.textContent = val > 0 ? "+" + val : val;
            }
            AppState.intensitySlider = val;
            recalculateAndRenderAll();
        }
    });

    const nflCheck = document.getElementById("filter-nfl");
    const ncaaCheck = document.getElementById("filter-ncaa");

    if (nflCheck) {
        nflCheck.addEventListener("change", (e) => {
            AppState.filters.nfl = e.target.checked;
            recalculateAndRenderAll();
        });
    }
    if (ncaaCheck) {
        ncaaCheck.addEventListener("change", (e) => {
            AppState.filters.ncaa = e.target.checked;
            recalculateAndRenderAll();
        });
    }
}

// ==========================================
// 2. LIVE 5-SECOND POLLING LOOP
// ==========================================
async function pollDataFeed() {
    try {
        const response = await fetch(`./data.json?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;

        const textData = await response.text();
        if (textData !== AppState.lastDataHash) {
            AppState.lastDataHash = textData;
            AppState.rawPayload = JSON.parse(textData);
            recalculateAndRenderAll();
        }
    } catch (err) {
        console.warn("DixPix Polling Notice: Waiting for local server / data.json feed...", err.message);
    }
}

// ==========================================
// 3. MASTER 12-MODULE CALCULATION PIPELINE
// ==========================================
function recalculateAndRenderAll() {
    if (!AppState.rawPayload || !AppState.rawPayload.games) return;

    const defaultLeague = (AppState.rawPayload.slate_info && AppState.rawPayload.slate_info.league) || "NFL";
    const mode = AppState.activeMode;
    const sliderVal = (mode === "davinci") ? AppState.intensitySlider : 0.0;

    AppState.processedGames = [];
    AppState.processedProps = [];

    AppState.rawPayload.games.forEach(game => {
        const gameLeague = game.league || defaultLeague;

        if (gameLeague === "NFL" && !AppState.filters.nfl) return;
        if (gameLeague === "NCAA" && !AppState.filters.ncaa) return;

        const m7 = calcBarometricBallistics(game.environmental_payload || {});
        const m8 = calcCircadianStrain(game.circadian_payload || {}, game.kickoff_local_hour);
        const m11 = calcBiophysicalMassLoad(
            game.environmental_payload || {},
            (game.team_telemetry && game.team_telemetry.home) || {},
            95.0,
            0.62,
            mode,
            sliderVal
        );
        const m12 = calcTurnoverEPAMatrix(
            game.team_telemetry || { home: {}, away: {} },
            gameLeague,
            mode,
            sliderVal
        );

        const psi11_12 = (mode === "tip")
            ? 0
            : calcCoupledInteractionPsi(m11.phiBioScore, m12.netTurnoverEPA, sliderVal);

        const m9 = calcFullGameFairMargin(game, m8.phiCircadianPenalty, psi11_12, mode);

        const gameRecord = {
            gameId: game.game_id,
            league: gameLeague,
            matchup: `${game.away_team} @ ${game.home_team}`,
            homeTeam: game.home_team,
            awayTeam: game.away_team,
            elevationM: (game.environmental_payload && game.environmental_payload.elevation_m) || 0,
            tempK: (game.environmental_payload && game.environmental_payload.temp_kelvin) || 288.15,
            windMph: (game.environmental_payload && game.environmental_payload.wind_mph) || 0,
            m7,
            m8,
            m9,
            m11,
            m12,
            psi11_12
        };

        AppState.processedGames.push(gameRecord);

        if (Array.isArray(game.props_board)) {
            game.props_board.forEach((prop, idx) => {
                const propKey = `${game.game_id}_${prop.player}_${idx}`;
                const m1 = calcVigFreeProbability(prop.base_odds_over || -110, prop.base_odds_under || -110);
                const vigFreeOver = m1.trueProbA;

                let rawModelProb = 0.5;
                if (prop.market_type === "spread" || prop.market_type === "total") {
                    rawModelProb = prop.model_win_prob !== undefined ? prop.model_win_prob : 0.50;
                } else if (prop.market_type === "discrete_count") {
                    const lambda = prop.projected_mean_mu || 1.5;
                    rawModelProb = prop.dispersion_r
                        ? calcNegBinOverProb(lambda, prop.dispersion_r, prop.base_line)
                        : calcPoissonOverProb(lambda, prop.base_line);
                } else {
                    const gammaRes = calcGammaSurvivalProb(
                        prop.projected_mean_mu || 50,
                        prop.projected_variance_sigma2 || 225,
                        prop.base_line || 45.5
                    );
                    rawModelProb = gammaRes.trueOverProb;
                }

                const moduleNormScores = {
                    m1: vigFreeOver - 0.5,
                    m2: rawModelProb - vigFreeOver,
                    m3: 0.05,
                    m4: prop.market_type === "discrete_count" ? (rawModelProb - 0.5) : 0,
                    m5: prop.market_type !== "discrete_count" ? (rawModelProb - 0.5) : 0,
                    m6: 0.04,
                    m7: (1.225 - m7.airDensityRho) * 2,
                    m8: -m8.circadianStrainIndex * 0.05,
                    m10: 0.05,
                    m11: mode === "tip" ? 0 : m11.phiBioScore * 0.1,
                    m12: mode === "tip" ? 0 : m12.netTurnoverEPA * 0.05
                };

                const masterAgg = calcMasterFibonacciAggregate(moduleNormScores, 13, sliderVal);

                // 1. Apply Mode & Slider Physics
                let activeModelProb = rawModelProb;
                if (mode === "unsolicited") {
                    activeModelProb = Math.max(0.01, Math.min(0.99, rawModelProb + (psi11_12 * 0.025) + (masterAgg.omegaFibScore * 0.15)));
                } else if (mode === "davinci") {
                    const sliderBoost = sliderVal * 0.06;
                    activeModelProb = Math.max(0.01, Math.min(0.99, rawModelProb + (psi11_12 * 0.04) + sliderBoost));
                }

                // 2. Anchor directly to base_line and shift dynamically with Mode & Slider
                const liveLine = (prop.base_line !== undefined && prop.base_line !== null)
                    ? Number(prop.base_line)
                    : (prop.projected_mean_mu || 0);

                let finalCalculatedLine = liveLine;
                if (prop.market_type === "spread") {
                    const spreadShift = (activeModelProb - 0.50) * 11.0;
                    // Subtracting spreadShift makes a favored spread more negative when win prob increases
                    finalCalculatedLine = Number((liveLine - spreadShift).toFixed(2));
                } else if (prop.market_type === "total") {
                    const totalShift = (activeModelProb - 0.50) * 15.0;
                    finalCalculatedLine = Number((liveLine + totalShift).toFixed(2));
                } else {
                    const baseMean = prop.projected_mean_mu || liveLine;
                    const propShift = (activeModelProb - rawModelProb) * 12.0;
                    finalCalculatedLine = Number((baseMean + propShift).toFixed(2));
                }

                const m2 = calcExpectedValueAndKelly(activeModelProb, prop.base_odds_over || -110);

                let altTrueProb = activeModelProb;
                if (prop.alt_line !== undefined) {
                    const altGamma = calcGammaSurvivalProb(
                        finalCalculatedLine || 50,
                        prop.projected_variance_sigma2 || 225,
                        prop.alt_line
                    );
                    altTrueProb = altGamma.trueOverProb;
                }
                const m6 = calcPropAltMER(
                    activeModelProb,
                    altTrueProb,
                    prop.base_odds_over || -110,
                    prop.alt_odds_over || -200
                );

                AppState.processedProps.push({
                    propKey,
                    commenceTime: game.commence_time,
                    gameId: game.game_id,
                    league: gameLeague,
                    matchup: gameRecord.matchup,
                    player: prop.player,
                    marketType: prop.market_type,
                    baseLine: prop.base_line,
                    baseOdds: prop.base_odds_over || -110,
                    projectedMean: finalCalculatedLine,
                    vigFreePct: Number((vigFreeOver * 100).toFixed(2)),
                    lockedModelPct: Number((rawModelProb * 100).toFixed(2)),
                    activeModelPct: Number((activeModelProb * 100).toFixed(2)),
                    activeModelProbRaw: activeModelProb,
                    edgeDeltaPct: Number(((activeModelProb - vigFreeOver) * 100).toFixed(2)),
                    evPct: Number(m2.evPercentage.toFixed(2)),
                    quarterKellyPct: Number(m2.quarterKellyStakePct.toFixed(2)),
                    altLine: prop.alt_line,
                    altOdds: prop.alt_odds_over,
                    altMer: Number(m6.merProp.toFixed(2)),
                    altAuthorized: m6.isAuthorized,
                    omegaFib: masterAgg.omegaFibScore
                });
            });
        }
    });

    AppState.processedProps.sort((a, b) => {
        const timeA = a.commenceTime || "";
        const timeB = b.commenceTime || "";
        if (timeA !== timeB) return timeA.localeCompare(timeB);
        return b.evPct - a.evPct;
    });

    render_game_cards(AppState.rawPayload);
    renderCombinatoricsDeck();
    renderCompendiumBoard();
    renderTelemetryInspector();
    renderBioWeatherLab();
}

// ==========================================
// 4. DOM REPAINT FUNCTIONS (ALL TABS)
// ==========================================
function render_game_cards(data) {
    const container = document.getElementById("master-board-body");
    if (!container) return;
    
    container.innerHTML = ""; 
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(auto-fit, minmax(300px, 1fr))";
    container.style.gap = "15px";

    const games = data.games || [];

    games.forEach(game => {
        const cardKey = game.game_id || `${game.away_team}@${game.home_team}`;

        let gameDate = "TBD";
        let gameTime = "TBD";
        if (game.commence_time) {
            const dt = new Date(game.commence_time);
            gameDate = dt.toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric' });
            gameTime = dt.toLocaleTimeString("en-US", { hour: 'numeric', minute: '2-digit' });
        }

        const env = game.environmental_payload || {};
        const weatherString = env.is_dome 
            ? "Dome (72°F)" 
            : `${env.temperature_f || "--"}°F | Wind: ${env.wind_mph || "--"} mph`;

        const card = document.createElement("div");
        card.className = "game-card";
        card.style.border = "1px solid #334155";
        card.style.borderRadius = "8px";
        card.style.backgroundColor = "#1e293b";
        card.style.padding = "15px";
        card.style.cursor = "pointer";
        card.style.color = "#e2e8f0";

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 10px; margin-bottom: 10px;">
                <span style="font-size: 0.85em; color: #94a3b8;">${gameDate} @ ${gameTime}</span>
                <span style="font-size: 0.85em; color: #94a3b8;">${weatherString}</span>
            </div>
            <div style="font-size: 1.25em; font-weight: bold; text-align: center; margin-bottom: 10px;">
                ${game.away_team} @ ${game.home_team}
            </div>
            <div style="font-size: 0.85em; text-align: center; color: #cbd5e1;">
                Click to expand props & telemetry
            </div>
        `;

        const drawer = document.createElement("div");
        drawer.style.display = openCardMemory.has(cardKey) ? "block" : "none";
        drawer.style.marginTop = "15px";
        drawer.style.borderTop = "1px solid #334155";
        drawer.style.paddingTop = "10px";

        const props = game.props_board || [];
        if (props.length === 0) {
            drawer.innerHTML = `<div style="font-size: 0.85em; color: #94a3b8;">No active lines available yet.</div>`;
        } else {
            props.forEach((p, idx) => {
                const propKey = `${game.game_id}_${p.player}_${idx}`;
                const engineData = AppState.processedProps.find(ep => ep.propKey === propKey);

                const proj = engineData ? engineData.projectedMean : p.projected_mean_mu;
                const winPct = engineData ? engineData.activeModelPct : 50.0;
                const displayProj = (proj === 0 || proj === "0.0") ? "0" : (proj !== undefined ? proj : "--");

                const propRow = document.createElement("div");
                propRow.style.display = "flex";
                propRow.style.justifyContent = "space-between";
                propRow.style.fontSize = "0.85em";
                propRow.style.padding = "4px 0";
                propRow.style.borderBottom = "1px solid #0f172a";

                propRow.innerHTML = `
                    <span>${p.player}</span>
                    <span style="color: ${winPct > 50 ? '#22c55e' : '#cbd5e1'};">
                        Proj: ${displayProj} (Win: ${winPct}%)
                    </span>
                `;
                drawer.appendChild(propRow);
            });
        }

        card.appendChild(drawer);

        card.addEventListener("click", () => {
            const isClosing = drawer.style.display === "block";
            drawer.style.display = isClosing ? "none" : "block";
            if (isClosing) {
                openCardMemory.delete(cardKey);
            } else {
                openCardMemory.add(cardKey);
            }
        });

        container.appendChild(card);
    });
}

function renderCombinatoricsDeck() {
    const container = document.getElementById("combinatorics-container");
    if (!container) return;

    const selectedProps = AppState.processedProps.filter(p => AppState.selectedParlayLegs.has(p.propKey));

    if (selectedProps.length === 0) {
        container.className = "empty-placeholder";
        container.innerHTML = `Check any props on the Master Pick Board to build 30% Profit Boost Parlays &amp; Uncorrelated Round Robins.`;
        return;
    }

    container.className = "table-responsive";
    const legsPayload = selectedProps.map(p => ({
        americanOdds: p.baseOdds,
        trueProb: p.activeModelProbRaw
    }));

    const m10 = calcProfitBoostParlayEV(legsPayload, 1.30);
    const baseStake = 10.00;
    const rawPayout = (baseStake * m10.dRaw).toFixed(2);
    const boostedPayout = (baseStake * m10.dBoost).toFixed(2);

    container.innerHTML = `
        <div style="padding: 20px;">
            <div style="display:flex; gap:24px; flex-wrap:wrap; margin-bottom:16px; font-family:var(--font-mono);">
                <div><strong>Selected Legs:</strong> ${selectedProps.length}</div>
                <div><strong>Joint Win Prob:</strong> <span style="color:var(--accent-cyan);">${m10.trueParlayProb}%</span></div>
                <div><strong>Raw Multiplier:</strong> ${m10.dRaw}x ($${rawPayout} on $10)</div>
                <div><strong>30% Boost Multiplier:</strong> <span style="color:var(--accent-gold);">${m10.dBoost}x ($${boostedPayout} on $10)</span></div>
                <div><strong>Boosted Parlay EV:</strong> <span style="color:${m10.evBoostPct >= 0 ? 'var(--accent-emerald)' : 'var(--accent-danger)'}; font-weight:700;">${m10.evBoostPct > 0 ? '+' : ''}${m10.evBoostPct}%</span></div>
            </div>
            <table class="quant-table">
                <thead>
                    <tr>
                        <th>Leg</th>
                        <th>Matchup</th>
                        <th>Line &amp; Odds</th>
                        <th>Model Win %</th>
                        <th>Single-Leg EV</th>
                    </tr>
                </thead>
                <tbody>
                    ${selectedProps.map(p => `
                        <tr>
                            <td>${p.player}</td>
                            <td>${p.matchup}</td>
                            <td>${p.baseLine} (${p.baseOdds > 0 ? '+' + p.baseOdds : p.baseOdds})</td>
                            <td>${p.activeModelPct}%</td>
                            <td>${p.evPct > 0 ? '+' : ''}${p.evPct}%</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderCompendiumBoard() {
    const tbody = document.getElementById("compendium-board-body");
    if (!tbody || AppState.processedGames.length === 0) return;

    const sliderVal = (AppState.activeMode === "davinci") ? AppState.intensitySlider : 0.0;

    tbody.innerHTML = AppState.processedGames.map(g => {
        const gameOmega = (
            (34 * ((g.m12.netTurnoverEPA || 0) * 0.1)) +
            (21 * (-g.m8.circadianStrainIndex * 0.1)) +
            (13 * (g.m11.phiBioScore * 0.05)) +
            (8 * ((1.225 - g.m7.airDensityRho) * 2)) +
            (13 * (g.psi11_12 * 0.1))
        ) / 76;

        const baseLogistic = 1.0 / (1.0 + Math.exp(-1.618 * gameOmega));
        const sliderMult = 1.0 + ((13 / 76) * sliderVal);
        const aggProb = Math.max(1.0, Math.min(99.0, baseLogistic * sliderMult * 100));

        return `
            <tr>
                <td><strong>${g.matchup}</strong></td>
                <td>${g.m7.airDensityRho} kg/m³</td>
                <td>${g.m8.circadianStrainIndex}</td>
                <td style="color:var(--accent-cyan);">${g.m11.phiBioScore}</td>
                <td>${g.m12.netTurnoverEPA > 0 ? '+' : ''}${g.m12.netTurnoverEPA}</td>
                <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-gold);">${gameOmega.toFixed(4)}</td>
                <td style="font-weight:700; color:var(--accent-emerald);">${aggProb.toFixed(1)}%</td>
            </tr>
        `;
    }).join("");
}

function renderTelemetryInspector() {
    const container = document.getElementById("telemetry-container");
    if (!container || AppState.processedGames.length === 0) return;

    container.className = "table-responsive";
    container.innerHTML = `
        <table class="quant-table">
            <thead>
                <tr>
                    <th>Matchup</th>
                    <th>Mode Active</th>
                    <th>Circadian Strain (CSI)</th>
                    <th>Turnover EPA Diff (M12)</th>
                    <th>Coupled Psi (Ψ_11,12)</th>
                    <th>Model Fair Home Spread (M9)</th>
                </tr>
            </thead>
            <tbody>
                ${AppState.processedGames.map(g => `
                    <tr>
                        <td><strong>${g.matchup}</strong></td>
                        <td style="text-transform:uppercase; color:var(--accent-cyan);">${AppState.activeMode}</td>
                        <td>${g.m8.circadianStrainIndex} (Φ_circ: ${g.m8.phiCircadianPenalty})</td>
                        <td>${g.m12.netTurnoverEPA > 0 ? '+' : ''}${g.m12.netTurnoverEPA}</td>
                        <td style="color:var(--accent-gold);">${g.psi11_12}</td>
                        <td><strong>${g.homeTeam} ${g.m9.fairHomeSpread > 0 ? '+' + g.m9.fairHomeSpread : g.m9.fairHomeSpread}</strong></td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

function renderBioWeatherLab() {
    const container = document.getElementById("biolab-container");
    if (!container || AppState.processedGames.length === 0) return;

    container.className = "table-responsive";
    container.innerHTML = `
        <table class="quant-table">
            <thead>
                <tr>
                    <th>Matchup</th>
                    <th>Elevation (m)</th>
                    <th>Local Gravity g(h)</th>
                    <th>Air Density ρ (kg/m³)</th>
                    <th>FG Shift (ΔD_FG)</th>
                    <th>Pass Carry (ΔD_Pass)</th>
                    <th>Pass Mod (ΔY_Total)</th>
                    <th>Somatic Density (ρ_player)</th>
                    <th>Biophysical Load (Φ_bio)</th>
                </tr>
            </thead>
            <tbody>
                ${AppState.processedGames.map(g => `
                    <tr>
                        <td><strong>${g.matchup}</strong></td>
                        <td>${g.elevationM}m</td>
                        <td>${g.m11.localGravityG} m/s²</td>
                        <td>${g.m7.airDensityRho}</td>
                        <td>${g.m7.fgRangeShiftYards > 0 ? '+' : ''}${g.m7.fgRangeShiftYards} yds</td>
                        <td>${g.m7.deepPassShiftYards > 0 ? '+' : ''}${g.m7.deepPassShiftYards} yds</td>
                        <td>${g.m7.passGameModifierYards > 0 ? '+' : ''}${g.m7.passGameModifierYards} yds</td>
                        <td>${g.m11.rhoPlayerDensity} kg/m³</td>
                        <td style="color:var(--accent-cyan);">${g.m11.phiBioScore} (x${g.m11.closingMultiplier})</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}