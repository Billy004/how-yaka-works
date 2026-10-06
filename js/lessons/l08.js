import { PAL, THREE, makeLabel, makeFlow, linePath, makeConduit, makeGlow, Timeline } from '../scene.js';
import { makeMCU, makeCIU, makePole, makeHouse, makeKeyIcon } from '../viz.js';

export default {
  id: 'l08', act: 3, num: 8,
  title: 'Inside a Yaka installation',
  subtitle: 'Why the meter is split in two, and why the half that matters is out of reach.',
  stageOpts: { camera: [1, 2.6, 15], target: [0.5, 1.4, 0], gridY: -2.4, maxDistance: 40 },

  learn: `
    <h3>Yaka and STS</h3>
    <p><strong>Yaka</strong> is the prepaid electricity service run by Uganda's distribution
    companies. Underneath it is <strong>STS</strong> — the Standard Transfer Specification,
    IEC 62055-41/51 — an open international standard for prepayment metering used across Africa,
    Asia and South America.</p>

    <h3>The requirement that shapes everything: offline</h3>
    <p>A meter must validate a purchase with <em>no</em> network of any kind. No SIM, no wiring back
    to the utility, no internet. A customer buys credit on their phone in one place and types
    twenty digits into a keypad somewhere else entirely — and the meter alone decides whether that
    is genuine.</p>
    <p>That single constraint rules out every online check. Which is why the answer is cryptography:
    the token must <em>carry its own proof</em>.</p>

    <h3>Two boxes, on purpose</h3>
    <table class="kv">
      <tr><td>MCU</td><td><strong>Measurement Control Unit.</strong> The real meter. Cryptographic
      engine, metering chip, EEPROM holding the Decoder Key, and the relay that physically connects
      or disconnects your supply. Sealed, and mounted high on a pole.</td></tr>
      <tr><td>CIU</td><td><strong>Customer Interface Unit.</strong> The keypad and screen on your
      wall. It has no key material, makes no decisions, and stores no credit. It is a remote
      control.</td></tr>
    </table>
    <p>They talk over <strong>PLC</strong> (a signal riding on your own mains wiring) or short-range
    <strong>RF</strong>.</p>

    <div class="callout cy"><p>The security consequence is the point: <strong>smash the keypad in
    your living room and nothing happens.</strong> The credit, the key, and the switch are all on
    the pole. The CIU is a keyboard, not a meter.</p></div>

    <h3>Explore it</h3>
    <p>Use the component buttons in <strong>Controls</strong> to highlight each part, or pull the
    installation apart with <strong>Exploded view</strong>. Try <strong>Open the terminal
    cover</strong> — that is a tamper event, and you will see what the meter does about it.</p>
  `,

  build({ stage, ui }) {
    const tl = new Timeline(stage);

    const pole = makePole(8.5);
    pole.position.set(-3.6, 0, 0);
    stage.add(pole);

    const mcu = makeMCU();
    mcu.group.position.set(-3.6, 3.4, 0.55);
    mcu.group.scale.setScalar(0.85);
    stage.add(mcu.group);

    const house = makeHouse();
    house.group.position.set(3.6, -0.3, 0);
    stage.add(house.group);

    const ciu = makeCIU();
    ciu.group.position.set(2.6, 0.1, 1.5);
    ciu.group.scale.setScalar(0.72);
    stage.add(ciu.group);

    // supply cable, pole → house
    const supply = makeConduit([-3.4, 2.4, 0.4], [2.4, 0.9, 0.2], PAL.amber);
    stage.add(supply);
    const supplyLabel = makeLabel('mains supply', { height: 0.16, mono: true, color: '#f0a04b' });
    supplyLabel.position.set(-0.6, 2.1, 0.3);
    stage.add(supplyLabel);

    // PLC / RF link
    const plc = makeFlow(linePath([-3.3, 2.2, 0.5], [2.4, 0.5, 1.4]), 16, PAL.violet, 0.06);
    plc.speed = 0.3;
    stage.add(plc.group);
    const plcLabel = makeLabel('PLC / RF  ·  keypresses up, status down',
      { height: 0.17, mono: true, color: '#c7b5e8' });
    plcLabel.position.set(-0.4, 1.35, 0.9);
    stage.add(plcLabel);

    // the key, living in the MCU
    const dk = makeKeyIcon(PAL.green);
    dk.scale.setScalar(0.42);
    dk.position.set(-3.75, 3.0, 1.15);
    stage.add(dk);
    const dkLabel = makeLabel('Decoder Key · in EEPROM, up here',
      { height: 0.15, mono: true, color: '#a6dcbc' });
    dkLabel.position.set(-3.4, 2.55, 1.15);
    stage.add(dkLabel);

    const reachLine = makeConduit([1.2, -2.2, 1.6], [1.2, 2.2, 1.6], PAL.red);
    reachLine.visible = false;
    stage.add(reachLine);

    // ── Component explanations ─────────────────────────────────────────
    const PARTS = {
      mcu: {
        label: 'MCU — the meter itself',
        text: 'Holds the cryptographic engine, the Decoder Key in EEPROM, the metering chip and ' +
              'the relay. Sealed, and mounted out of reach.',
        focus: () => { mcu.group.scale.setScalar(0.98); dk.scale.setScalar(0.5); },
        data: {
          'contains': 'crypto engine, EEPROM, metrology IC, relay, tamper sensors',
          'holds the key': 'yes — the Decoder Key never leaves this unit',
          'holds the credit': 'yes — remaining kWh is stored here',
          'location': 'sealed box, mounted high on a pole',
          'network': 'none'
        }
      },
      ciu: {
        label: 'CIU — the keypad indoors',
        text: 'Keypad and display only. No key material, no credit balance, no decisions. ' +
              'It forwards digits to the MCU and shows what the MCU replies.',
        focus: () => { ciu.group.scale.setScalar(0.85); },
        data: {
          'contains': 'keypad, LCD, PLC/RF modem',
          'holds the key': 'no',
          'holds the credit': 'no',
          'if destroyed': 'supply is unaffected; the utility swaps the unit',
          'attack value': 'none — there is nothing in it to steal'
        }
      },
      link: {
        label: 'PLC / RF link',
        text: 'The two units talk over your own mains wiring (power line communication) or a ' +
              'short-range radio link. Only keypresses and status cross it.',
        focus: () => { plc.speed = 0.75; plcLabel.material.color.set('#ffffff'); },
        data: {
          'carries': 'the 20 digits you typed; balance and status coming back',
          'does NOT carry': 'any key material',
          'range': 'the premises only',
          'intercepting it gives': 'a token you already know, and a balance reading'
        }
      },
      relay: {
        label: 'The relay',
        text: 'A physical switch inside the MCU. Credit runs out, or tamper is detected, and it ' +
              'opens. No software on your side of the wall can close it.',
        focus: () => { mcu.setLamp('relay', true, 2.4); },
        data: {
          'type': 'latching contactor, inside the sealed MCU',
          'closes when': 'a valid token is accepted and balance > 0',
          'opens when': 'balance reaches zero, or a tamper sensor trips',
          'reachable from indoors': 'no'
        }
      },
      key: {
        label: 'The Decoder Key',
        text: 'The 64-bit secret derived in Lesson 7. It is what makes an offline meter able to ' +
              'recognise a genuine token. It is inside the MCU, behind the seal.',
        focus: () => { dk.scale.setScalar(0.62); },
        data: {
          'size': '64 bits',
          'where': 'EEPROM inside the MCU',
          'how it got there': 'loaded at commissioning; re-derivable by the vending system',
          'changeable': 'yes — by a Key Change Token pair (Lesson 11)',
          'readable by the customer': 'no'
        }
      }
    };

    const resetFocus = () => {
      mcu.group.scale.setScalar(0.85);
      ciu.group.scale.setScalar(0.72);
      dk.scale.setScalar(0.42);
      plc.speed = 0.3;
      plcLabel.material.color.set('#ffffff');
      mcu.setLamp('relay', false);
    };

    // ── Controls ───────────────────────────────────────────────────────
    ui.section('Components');
    ui.chips({
      options: [
        { label: 'MCU', value: 'mcu' }, { label: 'CIU', value: 'ciu' },
        { label: 'Link', value: 'link' }, { label: 'Relay', value: 'relay' },
        { label: 'Key', value: 'key' }
      ],
      value: 'mcu',
      onChange: (k) => {
        resetFocus();
        const p = PARTS[k];
        p.focus();
        rPart.set(`<strong>${p.label}</strong><br>${p.text}`);
        ui.data(p.data);
      }
    });
    const rPart = ui.readout('Selected', '—');

    ui.section('View');
    let exploded = false;
    ui.button('Exploded view', (btn) => {
      exploded = !exploded;
      btn.innerHTML = exploded ? 'Reassemble' : 'Exploded view';
      const targets = exploded
        ? [[mcu.group, -6.2, 4.4], [ciu.group, 5.4, 0.8], [house.group, 3.6, -1.6]]
        : [[mcu.group, -3.6, 3.4], [ciu.group, 2.6, 0.1], [house.group, 3.6, -0.3]];
      const from = targets.map(([o]) => ({ x: o.position.x, y: o.position.y }));
      tl.run(0.9, (u) => {
        targets.forEach(([o, x, y], i) => {
          o.position.x = from[i].x + (x - from[i].x) * u;
          o.position.y = from[i].y + (y - from[i].y) * u;
        });
      });
      mcu.setCoverOpen(exploded ? 0.8 : 0);
    }, { variant: 'ghost' });

    ui.button('Show what a customer can reach', (btn) => {
      reachLine.visible = !reachLine.visible;
      btn.innerHTML = reachLine.visible ? 'Hide reach line' : 'Show what a customer can reach';
      if (reachLine.visible) {
        rPart.set('<strong class="text-danger">Everything to the right of the red line is ' +
                  'reachable from inside the house.</strong><br>None of it holds a key, a balance, ' +
                  'or the switch.');
        ui.data({
          'reachable': 'the CIU keypad and display, the indoor wiring',
          'not reachable': 'the MCU, the Decoder Key, the stored balance, the relay',
          'consequence': 'there is nothing worth attacking on the customer side',
          'this is the design': 'split-metering exists precisely to make that true'
        });
      }
    }, { variant: 'ghost' });

    ui.section('Tamper');
    let coverOpen = false;
    ui.button('Open the terminal cover', (btn) => {
      coverOpen = !coverOpen;
      btn.innerHTML = coverOpen ? 'Close the cover' : 'Open the terminal cover';
      tl.run(0.7, (u) => mcu.setCoverOpen(coverOpen ? u : 1 - u));
      if (coverOpen) {
        mcu.setLamp('tamper', true, 2.6);
        mcu.setLamp('relay', false);
        mcu.setScreen('TAMPER');
        house.setPower(false);
        ciu.setScreen('TAMPER');
        log.add('Cover micro-switch opened → tamper flag set.', 'err');
        log.add('Relay tripped. Supply disconnected.', 'err');
        log.add('Event written to EEPROM with a timestamp.', 'am');
        rPart.set('<strong class="text-danger">Tamper detected.</strong><br>The micro-switch ' +
                  'under the cover opened. The meter trips its relay immediately and logs the ' +
                  'event. Only the utility can clear it.');
      } else {
        mcu.setLamp('tamper', false);
        mcu.setScreen('TAMPER');
        log.add('Cover closed — but the flag stays set until a utility token clears it.', 'am');
      }
    }, { variant: 'danger' });

    ui.button('Utility clears the tamper flag', () => {
      mcu.setLamp('tamper', false);
      mcu.setLamp('relay', true, 1.8);
      mcu.setScreen('12.4 kWh');
      ciu.setScreen('READY');
      house.setPower(true);
      log.add('Tamper cleared by the utility. Relay closed.', 'ok');
    }, { variant: 'ghost' });

    ui.section('Log');
    const log = ui.log();

    stage.onTick((dt, t) => {
      mcu.tick(dt, t);
      ciu.tick(dt, t);
      plc.tick(dt);
      dk.userData.tick(dt, t);
    });

    // initial state
    mcu.setScreen('12.4 kWh');
    mcu.setLamp('relay', true, 1.6);
    house.setPower(true, 0.85);
    ciu.setScreen('READY');
    PARTS.mcu.focus();
    rPart.set(`<strong>${PARTS.mcu.label}</strong><br>${PARTS.mcu.text}`);
    ui.data(PARTS.mcu.data);
    log.add('Installation energised. Relay closed, 12.4 kWh remaining.', 'ok');
  }
};
