
const DECENT_SCALE_BLUETOOTH_NAME = 'Decent Scale';
const UUID_DECENT_SCALE_SVC = 0xFFF0;
const UUID_DECENT_SCALE_READ = 0xFFF4;
const UUID_DECENT_SCALE_WRITE = 0x36f5;

const CMD_DISPLAY_ON = new Uint8Array([0x03, 0x0A, 0x01, 0x01, 0x00, 0x00, 0x09])
const CMD_DISPLAY_OFF = new Uint8Array([0x03, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x09])

class Scale {
    constructor() {
        if (!navigator.bluetooth) {
            throw Error('Browser does not support Web Bluetooth')
        }
    }

    async connect() {
        const options = {
            filters: [
                { name: DECENT_SCALE_BLUETOOTH_NAME }
            ],
            optionalServices: [UUID_DECENT_SCALE_SVC]
        }

        this.device = await navigator.bluetooth.requestDevice(options);
        this.server = await this.device.gatt.connect();
        this.svc = await this.server.getPrimaryService(UUID_DECENT_SCALE_SVC);
        this.reader = await this.svc.getCharacteristic(UUID_DECENT_SCALE_READ);
        this.writer = await this.svc.getCharacteristic(UUID_DECENT_SCALE_WRITE);
    }

    async disconnect() {
        this.device.gatt.disconnect();
    }

    async sendCommand(cmd) {
        await this.writer.writeValue(cmd);
    }

    async subscribe(handlers) {
        await this.reader.startNotifications();
        this.reader.addEventListener(
            'characteristicvaluechanged',
            (event) => {
                if ([0xCA, 0xCE].includes(event.target.value.getUint8(1))) {
                    // weight measurement
                    let weight = event.target.value.getInt16(2) / 10;
                    let changed = event.target.value.getUint8(1) === 0xCA;
                    if(handlers.onWeightMeasurement) {
                        handlers.onWeightMeasurement(weight, changed);
                    }
                }
            }
        )
    }

    async unsubscribe() {
        await this.reader.stopNotifications();
    }
}

export { Scale, CMD_DISPLAY_OFF, CMD_DISPLAY_ON };