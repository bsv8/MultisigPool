import { createHmac } from 'crypto'

const secp256k1N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
const secp256k1NMinus1 = secp256k1N - 1n
const secp256k1P = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F')
const secp256k1Gx = BigInt('0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798')
const secp256k1Gy = BigInt('0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8')

function hmacSHA256(key: Buffer, data: Buffer): Buffer {
  return createHmac('sha256', key).update(data).digest() as Buffer
}

function int2octets(x: bigint): Buffer {
  // 32-byte big-endian
  const hex = x.toString(16).padStart(64, '0')
  return Buffer.from(hex, 'hex')
}

function bits2octets(bits: Buffer): Buffer {
  // 确保输入长度正确处理
  if (bits.length > 32) {
    bits = bits.slice(0, 32) // 截取前32字节
  }
  let z = BigInt('0x' + bits.toString('hex'))
  if (z >= secp256k1N) {
    z -= secp256k1N
  }
  return int2octets(z)
}

// Modular inverse using extended Euclidean algorithm
function modInverse(a: bigint, m: bigint): bigint {
  if (a < 0n) a = (a % m + m) % m

  let [old_r, r] = [a, m]
  let [old_s, s] = [1n, 0n]

  while (r !== 0n) {
    const quotient = old_r / r
      ;[old_r, r] = [r, old_r - quotient * r]
      ;[old_s, s] = [s, old_s - quotient * s]
  }

  return old_r > 1n ? 0n : (old_s % m + m) % m
}

// Elliptic curve point multiplication (scalar * G)
function scalarMultG(k: bigint): [bigint, bigint] {
  if (k === 0n) throw new Error('Invalid scalar')

  let [px, py] = [secp256k1Gx, secp256k1Gy]
  let [rx, ry] = [0n, 0n]
  let scalar = k

  while (scalar > 0n) {
    if (scalar & 1n) {
      if (rx === 0n && ry === 0n) {
        [rx, ry] = [px, py]
      } else {
        [rx, ry] = pointAdd(rx, ry, px, py)
      }
    }
    [px, py] = pointDouble(px, py)
    scalar >>= 1n
  }

  return [rx, ry]
}

// Point addition on secp256k1
function pointAdd(x1: bigint, y1: bigint, x2: bigint, y2: bigint): [bigint, bigint] {
  // 处理无穷远点
  if (x1 === 0n && y1 === 0n) return [x2, y2]
  if (x2 === 0n && y2 === 0n) return [x1, y1]

  if (x1 === x2) {
    if (y1 === y2) {
      return pointDouble(x1, y1)
    } else {
      // 返回无穷远点
      return [0n, 0n]
    }
  }

  const s = ((y2 - y1) * modInverse(x2 - x1, secp256k1P)) % secp256k1P
  const x3 = (s * s - x1 - x2) % secp256k1P
  const y3 = (s * (x1 - x3) - y1) % secp256k1P

  return [(x3 + secp256k1P) % secp256k1P, (y3 + secp256k1P) % secp256k1P]
}

// Point doubling on secp256k1
function pointDouble(x: bigint, y: bigint): [bigint, bigint] {
  const s = ((3n * x * x) * modInverse(2n * y, secp256k1P)) % secp256k1P
  const x3 = (s * s - 2n * x) % secp256k1P
  const y3 = (s * (x - x3) - y) % secp256k1P

  return [(x3 + secp256k1P) % secp256k1P, (y3 + secp256k1P) % secp256k1P]
}

export function generateKGoStyle(privKey: Buffer, hash: Buffer): bigint {
  if (privKey.length !== 32) {
    // left-pad to 32 bytes
    const padded = Buffer.alloc(32)
    privKey.copy(padded, 32 - privKey.length)
    privKey = padded
  }
  if (hash.length !== 32) {
    throw new Error('hash must be 32 bytes')
  }

  let v: Buffer = Buffer.alloc(32, 0x01)
  let k: Buffer = Buffer.alloc(32, 0x00)

  const bx = Buffer.concat([privKey, bits2octets(hash)])

  k = hmacSHA256(k, Buffer.concat([v, Buffer.from([0x00]), bx])) as Buffer
  v = hmacSHA256(k, v) as Buffer
  k = hmacSHA256(k, Buffer.concat([v, Buffer.from([0x01]), bx])) as Buffer
  v = hmacSHA256(k, v) as Buffer

  while (true) {
    v = hmacSHA256(k, v) as Buffer
    const candidate = BigInt('0x' + v.toString('hex'))
    if (candidate > 0n && candidate < secp256k1N) {
      return candidate
    }
    k = hmacSHA256(k, Buffer.concat([v, Buffer.from([0x00])])) as Buffer
    v = hmacSHA256(k, v) as Buffer
  }
}

// DER encode a signature
function encodeDER(r: bigint, s: bigint): Buffer {
  function encodeInteger(value: bigint): Buffer {
    let hex = value.toString(16)
    if (hex.length % 2) hex = '0' + hex
    let bytes = Buffer.from(hex, 'hex')

    // Add leading zero if first bit is set (to ensure positive)
    if (bytes[0] & 0x80) {
      bytes = Buffer.concat([Buffer.from([0x00]), bytes])
    }

    return Buffer.concat([Buffer.from([0x02, bytes.length]), bytes])
  }

  const rEncoded = encodeInteger(r)
  const sEncoded = encodeInteger(s)
  const content = Buffer.concat([rEncoded, sEncoded])

  return Buffer.concat([Buffer.from([0x30, content.length]), content])
}

// Go-compatible ECDSA signature
export function signGoCompatible(privateKeyHex: string, sighashHex: string): { r: string, s: string, der: Buffer } {
  const privateKeyBytes = Buffer.from(privateKeyHex, 'hex')
  const sighashBytes = Buffer.from(sighashHex, 'hex')

  // Generate Go-compatible nonce
  const k = generateKGoStyle(privateKeyBytes, sighashBytes)

  // Calculate r = (k * G).x mod n
  const [rx, _] = scalarMultG(k)
  const r = rx % secp256k1N

  if (r === 0n) {
    throw new Error('Invalid r value')
  }

  // Calculate s = k^-1 * (z + r * d) mod n
  const d = BigInt('0x' + privateKeyHex)
  const z = BigInt('0x' + sighashHex)
  const kInv = modInverse(k, secp256k1N)
  const rd = (r * d) % secp256k1N
  const zrd = (z + rd) % secp256k1N
  let s = (kInv * zrd) % secp256k1N

  // Canonicalize s (ensure s <= n/2)
  const halfN = secp256k1N / 2n
  if (s > halfN) {
    s = secp256k1N - s
  }

  return {
    r: r.toString(16).padStart(64, '0'),
    s: s.toString(16).padStart(64, '0'),
    der: encodeDER(r, s)
  }
}
