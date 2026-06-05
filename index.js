const gateway = `ws://IPdaESP/ws`;
let websocket;

function initWebSocket() {
    websocket = new WebSocket(gateway);
    websocket.onopen = () => {
        document.getElementById('connection-led').classList.add('connected');
        document.getElementById('connection-text').innerText = "ESP32 Online";
    };
    websocket.onclose = () => {
        document.getElementById('connection-led').classList.remove('connected');
        document.getElementById('connection-text').innerText = "Desconectado";
        setTimeout(initWebSocket, 2000);
    };
    websocket.onmessage = (event) => {
        const data = event.data.split(','); // "umidade,statusBomba"
        const umidade = parseInt(data[0]);
        const bombaAtiva = data[1] === "1";
        console.log(data)

        updateUI(umidade);
        updateRTData(umidade);
        updatePumpStatus(bombaAtiva);
    };
}

function sendToESP(val) {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(val.toString());
    }
}

let dryThreshold = 40;
let wetThreshold = 80;
let currentMode = 'realtime';

const drySlider = document.getElementById('dry-slider');
const wetSlider = document.getElementById('wet-slider');
const dryLabel = document.getElementById('dry-label');
const wetLabel = document.getElementById('wet-label');

// Validando valor do limiar seco
drySlider.addEventListener('input', (e) => {
    dryThreshold = parseInt(e.target.value);
    if (dryThreshold >= wetThreshold) {
        dryThreshold = wetThreshold - 1;
        drySlider.value = dryThreshold;
    }
    dryLabel.innerText = dryThreshold + '%';
    updateUI();
});

drySlider.addEventListener('change', () => sendToESP(dryThreshold));

wetSlider.addEventListener('input', (e) => {
    wetThreshold = parseInt(e.target.value);
    if (wetThreshold <= dryThreshold) {
        wetThreshold = dryThreshold + 1;
        wetSlider.value = wetThreshold;
    }
    wetLabel.innerText = wetThreshold + '%';
    updateUI();
});

function updatePumpStatus(isActive) {
    const badge = document.getElementById('pump-badge');
    const txt = document.getElementById('pump-text');
    if (isActive) {
        badge.classList.add('active-pump');
        txt.innerText = "LIGADA";
        txt.style.color = "var(--color-optimal)";
    } else {
        badge.classList.remove('active-pump');
        txt.innerText = "OFF";
        txt.style.color = "var(--text-muted)";
    }
}

// Gráfico e Medidor
const maxRTPoints = 20;
let rtLabels = Array(maxRTPoints).fill('');
let rtData = Array(maxRTPoints).fill(null);

const ctx = document.getElementById('historyChart').getContext('2d');
const historyChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: rtLabels,
        datasets: [{
            data: rtData,
            borderColor: '#00E676',
            backgroundColor: 'rgba(0, 230, 118, 0.1)',
            borderWidth: 3, pointRadius: 0, tension: 0.4, fill: true
        }]
    },
    options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            y: { min: 0, max: 100, grid: { color: '#2A2D3E' }, ticks: { color: '#A0A5B9' } },
            x: { display: false }
        },
        animation: false
    }
});

function updateUI(val = 0) {
    document.getElementById('moisture-value').innerText = Math.round(val) + '%';

    // Gauge Bar
    const bar = document.getElementById('gauge-bar');
    const offset = 502 - (val / 100) * 502;
    bar.style.strokeDashoffset = offset;

    // Cores Dinâmicas
    let color = "var(--color-optimal)";
    let status = "Solo Ideal";
    if (val < dryThreshold) { color = "var(--color-dry)"; status = "Solo Seco!"; }
    else if (val > wetThreshold) { color = "var(--color-wet)"; status = "Encharcado"; }

    bar.style.stroke = color;
    const statusEl = document.getElementById('moisture-status');
    statusEl.innerText = status;
    statusEl.style.color = color;
}

function updateRTData(val) {
    rtLabels.shift(); rtLabels.push(new Date().toLocaleTimeString('pt-BR'));
    rtData.shift(); rtData.push(val);
    if (currentMode === 'realtime') historyChart.update();
}

function setThresholds(d, w) {
    dryThreshold = d; wetThreshold = w;
    drySlider.value = d; wetSlider.value = w;
    dryLabel.innerText = d + '%'; wetLabel.innerText = w + '%';
    sendToESP(d);
    updateUI();
    toggleModal(false);
}

function toggleModal(s) { document.getElementById('plant-modal').classList.toggle('active', s); }

function updateChartMode(m) {
    currentMode = m;
    document.getElementById('btn-rt').classList.toggle('active', m === 'realtime');
    document.getElementById('btn-hist').classList.toggle('active', m === 'history');
    if (m === 'history') {
        historyChart.data.labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
        historyChart.data.datasets[0].data = [45, 52, 48, 42, 55, 60, 58];
        historyChart.data.datasets[0].pointRadius = 5;
    } else {
        historyChart.data.labels = rtLabels;
        historyChart.data.datasets[0].data = rtData;
        historyChart.data.datasets[0].pointRadius = 0;
    }
    historyChart.update();
}

window.onload = initWebSocket;