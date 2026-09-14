import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import DUT from '@/cloud/devices/F_V__F___W.B__ECON'
import type { Metadata } from '@/cloud/thinq'
import { MockHAConnection, MockThinq2Device } from '@/tests/helpers/mocks'

const DEVICE_ID = 'test-id'
const MODEL_ID = 'F_V__F___W.B__ECON'

const META: Metadata = {
    modelId: MODEL_ID,
    modelName: 'CV9014WC2',
    swVersion: 'test',
}

function packet(...parts: string[]) {
    return Buffer.from(parts.join(''), 'hex')
}

/*
 * Captured while manually changing the selected course from
 * Cotton+ to TurboWash 39 on an LG CV9014WC2.
 *
 * ECON 0x60 packets contain two consecutive state snapshots.
 * The first/older snapshot reports Cotton+, while the
 * second/newer snapshot reports TurboWash 39.
 */
const COURSE_CHANGE_60 = packet(
    'aaff200a006000a7a0000100ec004e00',
    '0002041804180400030a060100000000',
    '40000004040014003c00000200000000',
    '00000000000000000600270027310003',
    '0904010000000142200001010014003c',
    '00000100000000000000000000034abb',
)

/*
 * Captured with Cotton selected at 40 °C and 1200 RPM.
 */
const COTTON_40C_1200RPM_39 = packet(
    'aaff200a0039006fec00010ae200270000',
    '040217021701000309040100000000022100010100190000000004000109',
    '00000000000000da09bb',
)

function makeDevice() {
    const ha = new MockHAConnection()
    const thinq = new MockThinq2Device(DEVICE_ID, META)
    const dev = new DUT(ha.asConnection(), thinq, META)

    return { ha, thinq, dev }
}

describe(MODEL_ID, () => {
    test('device handler can be constructed', () => {
        const { ha, dev } = makeDevice()

        assert.ok(dev)
        assert.ok(ha.devices[DEVICE_ID])
        assert.ok(ha.devices[DEVICE_ID].config)
    })

    test('0x60 packet publishes the second/newer ECON snapshot', () => {
        const { ha, thinq } = makeDevice()

        thinq.emit('data', COURSE_CHANGE_60)

        const properties = ha.devices[DEVICE_ID].properties

        /*
         * First/older snapshot:
         *   course 0x04 = Cotton+
         *
         * Second/newer snapshot:
         *   course 0x31 = TurboWash 39
         *   remaining/initial time = 39 min
         *   spin = 1200 RPM
         *   temperature = 40 °C
         *
         * These assertions therefore also ensure that the handler did
         * not publish the first/older snapshot.
         */
        assert.equal(properties.course, 'TurboWash 39')
        assert.equal(properties.remaining_time, 39)
        assert.equal(properties.initial_time, 39)
        assert.equal(properties.spin, 1200)
        assert.equal(properties.temp, 40)
        assert.equal(properties.dry, 'Off')
        assert.equal(properties.turbo_wash, 'ON')
        assert.equal(properties.remote_start, 'ON')
    })

    test('0x39 packet decodes a captured Cotton cycle state', () => {
        const { ha, thinq } = makeDevice()

        thinq.emit('data', COTTON_40C_1200RPM_39)

        const properties = ha.devices[DEVICE_ID].properties

        assert.equal(properties.power, 'ON')
        assert.equal(properties.status, 'Measuring')
        assert.equal(properties.error, 'OFF')
        assert.equal(properties.course, 'Cotton')
        assert.equal(properties.remaining_time, 143)
        assert.equal(properties.initial_time, 143)
        assert.equal(properties.spin, 1200)
        assert.equal(properties.temp, 40)
        assert.equal(properties.dry, 'Off')
        assert.equal(properties.remote_start, 'ON')
        assert.equal(properties.child_lock, 'OFF')
        assert.equal(properties.steam, 'OFF')
        assert.equal(properties.cycles, 25)
        assert.equal(properties.energy, 9)
    })
})
