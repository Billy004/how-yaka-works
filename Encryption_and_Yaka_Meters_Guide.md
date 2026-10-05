# Comprehensive Guide: Cryptography, Key Management, and Uganda's Yaka Meter System

---

## Executive Summary

Encryption is the bedrock of modern digital security, providing confidentiality, data integrity, and authenticity across financial networks, communications, and utility systems. This document provides an in-depth analysis of cryptographic principles—focusing on symmetric vs. asymmetric encryption, public and private key pairs, and digital signatures—followed by a technical breakdown of how **Yaka** (Uganda's prepaid electricity system) utilizes the **Standard Transfer Specification (STS)** protocol to securely issue and validate prepaid tokens offline.

---

## Part 1: Fundamentals of Encryption

### 1. What is Encryption?
Encryption is the cryptographic process of encoding readable information (**plaintext**) into an unreadable format (**ciphertext**). Only authorized parties possessing the correct mathematical secret (**key**) can reverse the encoding process (**decryption**) to restore the original plaintext.

```
+-----------+        +-------------------+        +------------+
| Plaintext |  --->  | Encryption Engine |  --->  | Ciphertext |
+-----------+        +-------------------+        +------------+
                              ^
                              |
                         [Secret Key]
```

### 2. Symmetric vs. Asymmetric Encryption

| Feature | Symmetric Encryption | Asymmetric Encryption (Public Key Cryptography) |
| :--- | :--- | :--- |
| **Key Count** | Single key (shared between sender & receiver) | Key pair (1 Public Key + 1 Private Key) |
| **Key Distribution** | Secret key must be shared securely beforehand | Public key distributed freely; Private key kept secret |
| **Speed & Performance** | Extremely fast, computationally efficient | Slower, computationally intensive |
| **Common Algorithms** | AES (128/256-bit), 3DES, Blowfish | RSA, ECC (Elliptic Curve), Diffie-Hellman |
| **Primary Use Cases** | Bulk data encryption, disk encryption, local storage | Key exchange, digital signatures, secure handshakes (TLS) |

---

## Part 2: Public Key and Private Key Dynamics

### 1. The Key Pair Relationship
Asymmetric encryption relies on mathematically coupled keys. Although mathematically linked, calculating the private key from the public key is computationally infeasible using modern computing power.

* **Public Key:** Broadcast publicly to anyone. Used by senders to encrypt messages intended *only* for the key owner, or by third parties to verify digital signatures created by the owner.
* **Private Key:** Kept strictly secret by the owner. Used to decrypt messages that were encrypted with the corresponding public key, or to generate digital signatures.

### 2. Encryption Workflow (Confidentiality)
When **User A** wants to send a secure message to **User B**:
1. User A obtains User B's **Public Key**.
2. User A encrypts the plaintext message using User B's Public Key.
3. User A transmits the ciphertext across an untrusted network.
4. User B receives the ciphertext and uses their **Private Key** to decrypt it back into plaintext.
5. Even if intercepted, eavesdroppers cannot decrypt the payload without User B's Private Key.

### 3. Digital Signatures Workflow (Authenticity & Non-Repudiation)
Digital signatures turn asymmetric encryption on its head to guarantee identity and message integrity:
1. **Hashing:** The sender passes the original message through a cryptographic hash function (e.g., SHA-256) to produce a fixed-length digest.
2. **Signing:** The sender encrypts this hash using their **Private Key**. This encrypted hash is the **Digital Signature**.
3. **Verification:** The receiver decrypts the signature using the sender's **Public Key** to yield the original hash. The receiver then independently hashes the received message.
4. **Validation:** If the computed hash matches the decrypted signature hash, two facts are proven:
   * **Authenticity:** The message was indeed sent by the holder of the private key.
   * **Integrity:** The message content was not altered in transit.

---

## Part 3: How Yaka Meters Work in Uganda

### 1. Background: Yaka and the STS Standard
In Uganda, **Yaka** is the prepaid electricity metering system operated by electricity distribution companies (such as Umeme). Yaka operates on the internationally recognized **Standard Transfer Specification (STS)** (IEC 62055-41/51), an open standard for prepaid utility vending systems.

A major engineering requirement for Yaka is **offline operation**: the electricity meter in a residential home does not require an active internet connection, SIM card, or wired network connection to validate token purchases.

### 2. Hardware Architecture: Split-Meter System
To prevent physical tampering, modern Yaka installations split the meter into two isolated units:

```
+------------------------------------+        +-----------------------------------+
|   Customer Interface Unit (CIU)    |        |  Measurement Control Unit (MCU)   |
|         (Inside the Home)          |        |      (Mounted High on Pole)       |
|                                    |        |                                   |
| [ Keypad ]  -->  [ RF / PLC Comms ]| =====> | [ Decoder ] --> [ Relay Switch ]  |
| [ Display ]                        |        | [ EEPROM ]  --> [ Current Sensor ]|
+------------------------------------+        +-----------------------------------+
```

* **Measurement Control Unit (MCU):** The primary meter, containing the cryptographic engine, metrology chip, non-volatile EEPROM memory, and high-voltage circuit breaker relay. It is installed high up on utility poles inside sealed boxes to prevent physical tampering.
* **Customer Interface Unit (CIU):** The keypad and display screen installed inside the customer's house. It communicates with the MCU over **Power Line Communication (PLC)** (using home wiring) or short-range **Radio Frequency (RF)**.
* **Security Advantage:** Destroying, opening, or hacking the indoor keypad does not affect the actual metering logic or relay inside the MCU.

---

## Part 4: Token Generation & Decryption Breakdown

### 1. How a 20-Digit Yaka Token is Created
When a customer purchases electricity via Mobile Money (MTN, Airtel) or bank accounts, the utility vendor platform executes the following steps:

1. **Input Payload Assembly:**
   * **Meter Serial Number (S/N):** Unique 11-digit hardware ID.
   * **Credit Amount:** Purchased Kilowatt-hours (kWh).
   * **Time Identifier (TID):** Minutes elapsed since the STS base date (1993-01-01).
   * **Sub-class / Special Flags:** Indicating standard credit, key change, or emergency token.

2. **Cryptographic Encryption:**
   * The vending server looks up the specific secret **Decoder Key (DK)** associated with the customer's meter serial number.
   * The payload is encrypted using the STS cryptographic algorithm (traditionally 64-bit DES or 128-bit AES-based algorithms).
   * A CRC (Cyclic Redundancy Check) checksum is added for error detection.

3. **BCD Mapping:**
   * The binary ciphertext is converted into a **20-digit numerical token** formatted as five 4-digit blocks (e.g., `1234 - 5678 - 9012 - 3456 - 7890`).

### 2. Token Validation at the Meter
1. **Keypad Entry:** The user inputs the 20-digit code into the CIU keypad, which sends the digits to the MCU.
2. **Local Decryption:** The MCU pulls its unique **Decoder Key (DK)** from its secure internal memory and decrypts the 20-digit payload.
3. **Serial Number Match:** The meter verifies if the token was intended for its hardware ID.
4. **TID Anti-Replay Verification:**
   * The MCU reads the **TID** embedded in the token.
   * If `TID <= Stored_TID`, the meter rejects the token as a duplicate/replay attempt (e.g., user re-entering an old token).
   * If `TID > Stored_TID`, the token is valid, and the meter updates its stored TID.
5. **Credit Activation:** The MCU adds the parsed kWh value to the remaining balance and closes the internal relay switch to enable electric power.

---

## Part 5: Advanced Security Features & Maintenance

### 1. Key Change Tokens (KCT)
If the utility provider needs to upgrade security, change tariff structures, or transfer a meter to a new supply area, they issue a pair of **Key Change Tokens (KCTs)**:
* KCT 1 updates the internal base keys and operating parameters.
* KCT 2 registers the new cryptographic key set in the meter's non-volatile memory.
* This allows remote cryptographic re-keying without requiring physical hardware replacement or site visits.

### 2. Tamper Detection Mechanisms
Modern Yaka MCUs contain multi-layered tamper sensors:
* **Terminal Cover Removal:** Micro-switches detect unauthorized physical opening of the MCU cover, triggering an immediate trip of the internal relay.
* **Neutral Unbalance / Current Bypass:** Dual current transformers compare live and neutral line currents. If a discrepancy is detected (e.g., neutral bypass wiring), the meter continues measuring consumption on the higher current line or trips power entirely.
* **Magnetic Interference Detection:** Hall-effect sensors detect strong external magnetic fields placed near the meter to blind measurement transformers.

---

## Summary Table: Key Components of Yaka Cryptography

| Component | Function in Yaka System |
| :--- | :--- |
| **11-Digit Meter S/N** | Unique hardware address for targeted token encryption |
| **Decoder Key (DK)** | Secret key burned into meter EEPROM during manufacturing |
| **20-Digit Token** | Encrypted payload containing credit, TID, and validation CRC |
| **Time Identifier (TID)** | Anti-replay timestamp preventing reuse of spent tokens |
| **MCU & CIU Split** | Separation of physical metering/relay logic from indoor keypad |
| **Key Change Token (KCT)**| Over-the-air cryptographic update mechanism via keypad |

---
