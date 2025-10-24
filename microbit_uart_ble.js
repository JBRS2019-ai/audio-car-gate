// microbit_uart_ble.js — minimal Web Bluetooth bridge for micro:bit UART
// Exposes: connectButtonPressed(), sendUART(str)

(function () {
// Nordic UART Service (NUS) UUIDs
const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // data FROM micro:bit (indicate)
const UART_RX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // data TO micro:bit (write)

  // BLE write MTU (micro:bit is small; keep chunks <= 20 bytes)
  const MTU = 20;

  const state = {
    device: null,
    server: null,
    service: null,
    txChar: null, // notify
    rxChar: null  // write
  };

  function log(...args) {
    try { console.log('[microbit-ble]', ...args); } catch (_) {}
  }

  async function connect() {
    // Accept all devices; rely on service filter so the picker is populated
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [UART_SERVICE]
    });
    state.device = device;
    device.addEventListener('gattserverdisconnected', () => log('disconnected'));

    state.server = await device.gatt.connect();
    state.service = await state.server.getPrimaryService(UART_SERVICE);

    // Get characteristics
    state.txChar = await state.service.getCharacteristic(UART_TX);
    state.rxChar = await state.service.getCharacteristic(UART_RX);

    // Start notifications (optional, but useful for debugging)
    try {
      await state.txChar.startNotifications();
      state.txChar.addEventListener('characteristicvaluechanged', onNotify);
    } catch (_) {
      log('notifications not available (ok to ignore)');
    }

    log('connected');
  }

  function onNotify(e) {
    const text = new TextDecoder().decode(e.target.value || new DataView());
    log('RX <=', JSON.stringify(text));
    // If you want to surface this to the page:
    if (typeof window.onMicrobitUart === 'function') window.onMicrobitUart(text);
  }

  async function sendUARTLine(str) {
    if (!state.rxChar) {
      log('sendUART called but not connected');
      return;
    }
    const line = String(str).endsWith('\n') ? String(str) : String(str) + '\n';
    const data = new TextEncoder().encode(line);

    // chunk writes
    for (let i = 0; i < data.length; i += MTU) {
      const chunk = data.slice(i, i + MTU);
      if (state.rxChar.writeValueWithoutResponse) {
        await state.rxChar.writeValueWithoutResponse(chunk);
      } else {
        await state.rxChar.writeValue(chunk);
      }
    }
    log('TX =>', JSON.stringify(line));
  }

  // ----- public API expected by your HTML -----
  window.connectButtonPressed = async function () {
    try {
      if (!('bluetooth' in navigator)) {
        alert('Web Bluetooth is not supported in this browser.');
        return;
      }
      await connect();
      if (typeof window.onMicrobitConnected === 'function') window.onMicrobitConnected();
    } catch (err) {
      console.error(err);
      alert('Bluetooth connect failed: ' + (err.message || 'see console'));
    }
  };

  window.sendUART = function (s) {
    // fire-and-forget; errors reported to console
    sendUARTLine(s).catch(err => console.error('UART write failed', err));
  };
})();
