import { PAL, THREE, makeLabel, makeFlow, Timeline, easeInOut } from '../scene.js';
import { makeSite, makeKeyIcon } from '../viz.js';
import { Store } from '../store.js';

export default {
  id: 'l08', act: 3, num: 8,
  title: 'Inside a Yaka installation',
  subtitle: 'Why the meter is split in two, and why the half that matters is out of reach.',
  stageOpts: { camera: [4.4, 4.2, 13.6], target: [-0.6, 0.2, 0], gridY: -2.6, maxDistance: 40, minDistance: 3 },
  hint: 'Click a part to inspect it · type on the keypad in the house · drag to orbit',

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
    <p>The scene is live, too: click the meter, the keypad or the cable to inspect them, click the
    terminal cover to open it, and type on the keypad inside the house to send digits up the wire.</p>
  `,

  build({ stage, ui }) {
    const tl = new Timeline(stage);
    stage.enableShadows();

    // ── The installation, on its own plot of ground ────────────────────
    const drn = /^\d{11}$/.test(Store.get('drn')) ? Store.get('drn') : '04122334455';
    const site = makeSite({ drn });
    site.group.position.y = stage.floorY + site.ground.thickness;     // the slab stands on the floor
    stage.add(site.group);
    site.occluders.forEach(o => stage.occluder(o));
    const { mcu, ciu, house } = site;

    // data rides the mains wiring; power comes down the same cables
    const plc = makeFlow(site.paths.plc, 22, PAL.violet, 0.05);
    plc.speed = 0.14;
    const power = makeFlow(site.paths.supply, 28, PAL.amber, 0.042);
    power.speed = 0.1;
    site.group.add(plc.group, power.group);

    const tag = (text, pos, opts = {}) => {
      const l = makeLabel(text, { height: 0.36, color: '#ebe9e4', bg: 'rgba(22,23,26,0.82)', ...opts });
      l.position.copy(pos);
      site.group.add(l);
      return l;
    };
    const hp = site.house.group.position;
    const ciuTag = tag('CIU · keypad by the door', new THREE.Vector3(hp.x - 0.4, 0.85, hp.z + 2.3));
    const plcPos = new THREE.Vector3(...site.paths.plc(0.8)).add(new THREE.Vector3(0, -0.45, 0.2));
    const plcLabel = tag('PLC · keypresses up, status down', plcPos, { height: 0.3, color: '#d7c8f0' });
    const supplyLabel = tag('mains supply', new THREE.Vector3(...site.paths.supply(0.08)).add(new THREE.Vector3(0.75, 0.15, 0.2)),
      { height: 0.28, color: '#f0c58b' });

    // the Decoder Key, beside the MCU that holds it
    const dk = makeKeyIcon(PAL.green);
    const dkBase = site.anchors.mcu.clone().add(new THREE.Vector3(-1.15, 0.35, 0.35));
    dk.scale.setScalar(0.32);
    dk.position.copy(dkBase);
    site.group.add(dk);
    const dkLabel = tag('Decoder Key · in EEPROM, up here', dkBase.clone().add(new THREE.Vector3(0, -0.45, 0)),
      { height: 0.26, color: '#a6dcbc' });

    // what a customer can reach: a translucent boundary between the pole and the house
    const reach = new THREE.Group();
    const reachX = site.house.group.position.x - 2.6;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(site.ground.depth - 0.6, 3.6), new THREE.MeshBasicMaterial({
      color: PAL.red, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false
    }));
    wall.rotation.y = Math.PI / 2;
    wall.position.set(reachX, 1.8, 0);
    wall.userData.noShadow = wall.userData.noFit = true;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(wall.geometry),
      new THREE.LineDashedMaterial({ color: PAL.red, dashSize: 0.25, gapSize: 0.15, transparent: true, opacity: 0.9 }));
    edge.rotation.copy(wall.rotation);
    edge.position.copy(wall.position);
    edge.computeLineDistances();
    const reachTag = makeLabel('customer side →', { height: 0.34, color: '#f3b3ae', bg: 'rgba(22,23,26,0.82)' });
    reachTag.position.set(reachX + 0.9, 3.75, 1.2);
    reach.add(wall, edge, reachTag);
    reach.visible = false;
    site.group.add(reach);

    // ── Component explanations ─────────────────────────────────────────
    const base = { mcu: mcu.group.scale.x, ciu: ciu.group.scale.x, dk: dk.scale.x };
    const PARTS = {
      mcu: {
        label: 'MCU — the meter itself',
        text: 'Holds the cryptographic engine, the Decoder Key in EEPROM, the metering chip and ' +
              'the relay. Sealed, and mounted out of reach.',
        focus: () => { mcu.group.scale.setScalar(base.mcu * 1.18); dk.scale.setScalar(base.dk * 1.2); },
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
        focus: () => { ciu.group.scale.setScalar(base.ciu * 1.35); ciuTag.setOpacity(1); },
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
        focus: () => { plc.speed = 0.4; plcLabel.setOpacity(1); },
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
        focus: () => { mcu.setLamp('relay', true, 2.4); power.speed = 0.3; },
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
        focus: () => { dk.scale.setScalar(base.dk * 1.6); },
        data: {
          'size': '64 bits',
          'where': 'EEPROM inside the MCU',
          'how it got there': 'loaded at commissioning; re-derivable by the vending system',
          'changeable': 'yes — by a Key Change Token pair (Lesson 11)',
          'readable by the customer': 'no'
        }
      }
    };

    let tampered = false;
    const resetFocus = () => {
      mcu.group.scale.setScalar(base.mcu);
      ciu.group.scale.setScalar(base.ciu);
      dk.scale.setScalar(base.dk);
      plc.speed = 0.14;
      power.speed = 0.1;
      if (!tampered) mcu.setLamp('relay', true, 1.6);
    };
    const select = (k) => {
      resetFocus();
      const p = PARTS[k];
      p.focus();
      parts.set(k);
      rPart.set(`<strong>${p.label}</strong><br>${p.text}`);
      ui.data(p.data);
    };

    // ── Controls ───────────────────────────────────────────────────────
    ui.section('Components');
    const parts = ui.chips({
      options: [
        { label: 'MCU', value: 'mcu' }, { label: 'CIU', value: 'ciu' },
        { label: 'Link', value: 'link' }, { label: 'Relay', value: 'relay' },
        { label: 'Key', value: 'key' }
      ],
      value: 'mcu',
      onChange: select
    });
    const rPart = ui.readout('Selected', '—');
    ui.note('You can also click the parts in the 3D view, and type on the keypad inside the house.');

    ui.section('View');
    let exploded = false;
    const home = { mcu: mcu.group.position.clone(), ciu: ciu.group.position.clone(), roof: house.roof.position.clone() };
    ui.button('Exploded view', (btn) => {
      exploded = !exploded;
      btn.innerHTML = exploded ? 'Reassemble' : 'Exploded view';
      const moves = [
        [mcu.group.position, home.mcu.clone().add(new THREE.Vector3(0, exploded ? 0.25 : 0, exploded ? 1.7 : 0))],
        [ciu.group.position, home.ciu.clone().add(new THREE.Vector3(0, exploded ? 0.2 : 0, exploded ? 2.9 : 0))],
        [house.roof.position, home.roof.clone().add(new THREE.Vector3(0, exploded ? 1.5 : 0, 0))]
      ];
      const from = moves.map(([p]) => p.clone());
      tl.run(0.9, (u) => moves.forEach(([p, to], i) => p.lerpVectors(from[i], to, easeInOut(u))));
      if (!tampered) tl.run(0.6, (u) => mcu.setCoverOpen(exploded ? u * 0.8 : 0.8 * (1 - u)));
    }, { variant: 'ghost' });

    ui.button('Show what a customer can reach', (btn) => {
      reach.visible = !reach.visible;
      btn.innerHTML = reach.visible ? 'Hide the boundary' : 'Show what a customer can reach';
      if (reach.visible) {
        rPart.set('<strong class="text-danger">Everything on the house side of the red boundary is ' +
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
    const coverBtn = ui.button('Open the terminal cover', () => toggleCover(), { variant: 'danger' });
    const toggleCover = () => {
      coverOpen = !coverOpen;
      coverBtn.label(coverOpen ? 'Close the cover' : 'Open the terminal cover');
      const from = mcu.coverOpen;
      tl.run(0.7, (u) => mcu.setCoverOpen(from + ((coverOpen ? 1 : 0) - from) * easeInOut(u)));
      if (coverOpen) {
        tampered = true;
        mcu.setLamp('tamper', true, 2.6);
        mcu.setLamp('relay', false);
        mcu.setScreen('TAMPER');
        site.setPower(false);
        power.active = false;
        ciu.setScreen('TAMPER');
        ciu.setLed('ok', false);
        ciu.setLed('err', true);
        log.add('Cover micro-switch opened → tamper flag set.', 'err');
        log.add('Relay tripped. Supply disconnected.', 'err');
        log.add('Event written to EEPROM with a timestamp.', 'am');
        rPart.set('<strong class="text-danger">Tamper detected.</strong><br>The micro-switch ' +
                  'under the cover opened and the seal wire broke. The meter trips its relay ' +
                  'immediately and logs the event. Only the utility can clear it.');
      } else {
        mcu.setLamp('tamper', false);
        mcu.setScreen('TAMPER');
        log.add('Cover closed — but the flag stays set until a utility token clears it.', 'am');
      }
    };

    ui.button('Utility clears the tamper flag', () => {
      tampered = false;
      mcu.setLamp('tamper', false);
      mcu.setScreen('12.4 kWh');
      site.setPower(true, 0.85);
      power.active = true;
      ciu.setScreen('12.4 kWh');
      ciu.setLed('err', false);
      ciu.setLed('ok', true);
      log.add('Tamper cleared by the utility. Relay closed.', 'ok');
    }, { variant: 'ghost' });

    ui.section('Log');
    const log = ui.log();

    // ── Clicking the scene ──────────────────────────────────────────────
    stage.interactive(mcu.group, { onClick: () => select('mcu') });
    stage.interactive(mcu.cover, { onClick: () => toggleCover() });
    stage.interactive(ciu.body, { onClick: () => select('ciu') });
    stage.interactive(site.cables.service.mesh, { onClick: () => select('link') });
    stage.interactive(dk, { onClick: () => select('key') });

    // Typing on the keypad: the digits travel to the MCU over the house wiring.
    ciu.enableInput(stage, {
      onEnter: (entry) => {
        if (entry.length < 20) {
          ciu.setScreen('INCOMPLETE');
          log.add(`The keypad needs all 20 digits — ${entry.length} typed.`, 'am');
          return;
        }
        ciu.setScreen('SENT');
        plc.speed = 0.9;
        log.add(`${entry.replace(/(.{4})/g, '$1 ').trim()} → sent to the MCU over the PLC link.`, 'cy');
        log.add('Checking those digits is the MCU’s job — that is Lesson 10.', '');
        tl.run(1.6, null, () => {
          plc.speed = 0.14;
          mcu.setScreen('TOKEN?');
          ciu.setScreen('SEE LESSON 10');
          tl.run(1.6, null, () => { mcu.setScreen(tampered ? 'TAMPER' : '12.4 kWh'); ciu.setScreen(tampered ? 'TAMPER' : '12.4 kWh'); });
        });
      }
    });

    stage.onTick((dt, t) => {
      site.tick(dt, t);
      plc.tick(dt);
      power.tick(dt);
      dk.userData.tick(dt, t);
    });

    // initial state
    mcu.setScreen('12.4 kWh');
    site.setPower(true, 0.85);
    ciu.setScreen('12.4 kWh');
    ciu.setLed('ok', true);
    select('mcu');
    log.add('Installation energised. Relay closed, 12.4 kWh remaining.', 'ok');
  }
};
