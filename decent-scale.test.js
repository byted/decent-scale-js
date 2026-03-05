import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scale, CMD_DISPLAY_ON, CMD_DISPLAY_OFF } from './decent-scale.js';

function makeWeightEvent(byte1, rawInt16) {
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    view.setUint8(0, 0x00);
    view.setUint8(1, byte1);
    view.setInt16(2, rawInt16);
    return { target: { value: view } };
}

function makeConnectedScale() {
    const mockWriter = { writeValue: vi.fn().mockResolvedValue(undefined) };
    const mockReader = {
        startNotifications: vi.fn().mockResolvedValue(undefined),
        stopNotifications: vi.fn().mockResolvedValue(undefined),
        addEventListener: vi.fn(),
    };
    const mockSvc = {
        getCharacteristic: vi.fn().mockImplementation((uuid) => {
            if (uuid === 0xFFF4) return Promise.resolve(mockReader);
            if (uuid === 0x36f5) return Promise.resolve(mockWriter);
        }),
    };
    const mockServer = { getPrimaryService: vi.fn().mockResolvedValue(mockSvc) };
    const mockDevice = { gatt: { connect: vi.fn().mockResolvedValue(mockServer), disconnect: vi.fn() } };
    const mockBluetooth = { requestDevice: vi.fn().mockResolvedValue(mockDevice) };

    vi.stubGlobal('navigator', { bluetooth: mockBluetooth });

    return { scale: new Scale(), mockDevice, mockServer, mockSvc, mockReader, mockWriter, mockBluetooth };
}

describe('constants', () => {
    it('CMD_DISPLAY_ON has correct bytes', () => {
        expect(CMD_DISPLAY_ON).toEqual(new Uint8Array([0x03, 0x0A, 0x01, 0x01, 0x00, 0x00, 0x09]));
    });

    it('CMD_DISPLAY_OFF has correct bytes', () => {
        expect(CMD_DISPLAY_OFF).toEqual(new Uint8Array([0x03, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x09]));
    });
});

describe('Scale constructor', () => {
    it('throws when Web Bluetooth is not available', () => {
        vi.stubGlobal('navigator', {});
        expect(() => new Scale()).toThrow('Browser does not support Web Bluetooth');
    });

    it('does not throw when Web Bluetooth is available', () => {
        vi.stubGlobal('navigator', { bluetooth: {} });
        expect(() => new Scale()).not.toThrow();
    });
});

describe('Scale.connect()', () => {
    it('requests a device with correct filter and optional service', async () => {
        const { scale, mockBluetooth } = makeConnectedScale();
        await scale.connect();
        expect(mockBluetooth.requestDevice).toHaveBeenCalledWith({
            filters: [{ name: 'Decent Scale' }],
            optionalServices: [0xFFF0],
        });
    });

    it('connects to gatt server', async () => {
        const { scale, mockDevice } = makeConnectedScale();
        await scale.connect();
        expect(mockDevice.gatt.connect).toHaveBeenCalled();
    });

    it('initializes lastWeightGrams to 0', async () => {
        const { scale } = makeConnectedScale();
        await scale.connect();
        expect(scale.lastWeightGrams).toBe(0);
    });
});

describe('Scale.disconnect()', () => {
    it('calls gatt.disconnect', async () => {
        const { scale, mockDevice } = makeConnectedScale();
        await scale.connect();
        scale.disconnect();
        expect(mockDevice.gatt.disconnect).toHaveBeenCalled();
    });
});

describe('Scale.sendCommand()', () => {
    it('writes the command value', async () => {
        const { scale, mockWriter } = makeConnectedScale();
        await scale.connect();
        await scale.sendCommand(CMD_DISPLAY_ON);
        expect(mockWriter.writeValue).toHaveBeenCalledWith(CMD_DISPLAY_ON);
    });
});

describe('Scale.subscribe()', () => {
    it('starts notifications on the reader', async () => {
        const { scale, mockReader } = makeConnectedScale();
        await scale.connect();
        await scale.subscribe({});
        expect(mockReader.startNotifications).toHaveBeenCalled();
    });

    it('registers a characteristicvaluechanged listener', async () => {
        const { scale, mockReader } = makeConnectedScale();
        await scale.connect();
        await scale.subscribe({});
        expect(mockReader.addEventListener).toHaveBeenCalledWith(
            'characteristicvaluechanged',
            expect.any(Function)
        );
    });

    it('calls onWeightMeasurement with correct weight for 0xCA event (changed=true)', async () => {
        const { scale, mockReader } = makeConnectedScale();
        await scale.connect();
        const handler = vi.fn();
        await scale.subscribe({ onWeightMeasurement: handler });
        const listener = mockReader.addEventListener.mock.calls[0][1];
        listener(makeWeightEvent(0xCA, 250)); // 250 / 10 = 25.0g
        expect(handler).toHaveBeenCalledWith(true, 25.0, expect.any(Number));
    });

    it('calls onWeightMeasurement with changed=false for 0xCE event', async () => {
        const { scale, mockReader } = makeConnectedScale();
        await scale.connect();
        const handler = vi.fn();
        await scale.subscribe({ onWeightMeasurement: handler });
        const listener = mockReader.addEventListener.mock.calls[0][1];
        listener(makeWeightEvent(0xCE, 100)); // 10.0g
        expect(handler).toHaveBeenCalledWith(false, 10.0, expect.any(Number));
    });

    it('computes gramsPerSecond correctly across two events', async () => {
        const { scale, mockReader } = makeConnectedScale();
        await scale.connect();
        const handler = vi.fn();
        await scale.subscribe({ onWeightMeasurement: handler });
        const listener = mockReader.addEventListener.mock.calls[0][1];
        listener(makeWeightEvent(0xCA, 100)); // 10.0g, lastWeight=0 → gps=(10-0)*10=100
        listener(makeWeightEvent(0xCA, 150)); // 15.0g, lastWeight=10 → gps=(15-10)*10=50
        expect(handler.mock.calls[0][2]).toBeCloseTo(100);
        expect(handler.mock.calls[1][2]).toBeCloseTo(50);
    });

    it('ignores events with unknown byte1', async () => {
        const { scale, mockReader } = makeConnectedScale();
        await scale.connect();
        const handler = vi.fn();
        await scale.subscribe({ onWeightMeasurement: handler });
        const listener = mockReader.addEventListener.mock.calls[0][1];
        listener(makeWeightEvent(0xFF, 100));
        expect(handler).not.toHaveBeenCalled();
    });

    it('does not throw if onWeightMeasurement handler is not provided', async () => {
        const { scale, mockReader } = makeConnectedScale();
        await scale.connect();
        await scale.subscribe({});
        const listener = mockReader.addEventListener.mock.calls[0][1];
        expect(() => listener(makeWeightEvent(0xCA, 100))).not.toThrow();
    });
});

describe('Scale.unsubscribe()', () => {
    it('stops notifications', async () => {
        const { scale, mockReader } = makeConnectedScale();
        await scale.connect();
        await scale.subscribe({});
        await scale.unsubscribe();
        expect(mockReader.stopNotifications).toHaveBeenCalled();
    });
});
