
import Elliptic from 'elliptic'
import hex64 from 'hex64'
import sha3 from 'js-sha3'

import * as bytes from './bytes'

const RougeUtils = Web3 => {
  let curve = null

  function getCurve () {
    if (!curve) {
      // eslint-disable-next-line new-cap
      curve = new Elliptic.ec('secp256k1')
    }
    return curve
  }

  function keccak256 (data) {
    return '0x' + sha3.keccak_256(bytes.arrayify(data))
  }

  const authHash = (msg, campaign, bearer) => Web3.utils.soliditySha3(
    {t: 'string', v: msg}, {t: 'address', v: campaign}, {t: 'address', v: bearer}
  )

  function hashMessage (message) {
    return keccak256(bytes.concat([
      Web3.utils.hexToBytes(Web3.utils.utf8ToHex('\x19Ethereum Signed Message:\n')),
      Web3.utils.hexToBytes(Web3.utils.utf8ToHex(String(message.length))),
      ((typeof (message) === 'string') ? Web3.utils.hexToBytes(Web3.utils.utf8ToHex(message)) : message)
    ]))
  }

  function sign (privateKey, digest) {
    const keyPair = getCurve().keyFromPrivate(bytes.arrayify(privateKey))
    const signature = keyPair.sign(bytes.arrayify(digest), { canonical: true })
    return {
      recoveryParam: signature.recoveryParam,
      r: bytes.hexZeroPad('0x' + signature.r.toString(16), 32),
      s: bytes.hexZeroPad('0x' + signature.s.toString(16), 32),
      v: 27 + signature.recoveryParam
    }
  };

  const authHashProtocolSig = (msg, campaign, bearer, privateKey) => {
    const hash = authHash(msg, campaign, bearer)
    const digest = hashMessage(Web3.utils.hexToBytes(
      Web3.utils.utf8ToHex('Rouge ID: ' + hash.substr(2))
    ))
    return sign(privateKey, Web3.utils.hexToBytes(digest))
  }

  function authHashRpcSig (msg, campaign, bearer, privateKey) {
    // check pkey with 0x
    const hash = authHash(msg, campaign, bearer)
    return bytes.joinSignature(
      sign(privateKey, Web3.utils.hexToBytes(hash))
    )
  }

  function rougeQR (msg, campaign, bearer, privateKey) {
    // check pkey with 0x
    const rpcSig = authHashRpcSig(msg, campaign, bearer, privateKey)
    return hex64.toBase64(bearer.substr(2) + rpcSig.substr(2) + Web3.utils.utf8ToHex(msg).substr(2))
  }

  function recoverPublicKey (digest, signature) {
    const sig = bytes.splitSignature(signature)
    const rs = { r: bytes.arrayify(sig.r), s: bytes.arrayify(sig.s) }
    return '0x' + getCurve().recoverPubKey(bytes.arrayify(digest), rs, sig.recoveryParam).encode('hex', false)
  }

  function computePublicKey (key, compressed) {
    var _bytes = bytes.arrayify(key)
    if (_bytes.length === 32) {
      /*
        var keyPair = new KeyPair(_bytes)
        if (compressed) {
        return keyPair.compressedPublicKey
        }
        return keyPair.publicKey
      */
      throw new Error('not implemented')
    } else if (_bytes.length === 33) {
      if (compressed) {
        return bytes.hexlify(_bytes)
      }
      return '0x' + getCurve().keyFromPublic(_bytes).getPublic(false, 'hex')
    } else if (_bytes.length === 65) {
      if (!compressed) {
        return bytes.hexlify(_bytes)
      }
      return '0x' + getCurve().keyFromPublic(_bytes).getPublic(true, 'hex')
    }
    throw new Error('invalid public or private key')
  }

  function computeAddress (key) {
    const publicKey = '0x' + computePublicKey(key).slice(4)
    return '0x' + keccak256(publicKey).substring(26)
  }

  function checkSignature (msg, campaign, bearer, signature) {
    const recovered = computeAddress(recoverPublicKey(
      bytes.arrayify(authHash(msg, campaign, bearer)),
      bytes.splitSignature(signature)
    ))
    return recovered.toLowerCase() === bearer.toLowerCase()
  }

  function decodeRougeQR (code, getCampaign) {
    const raw = hex64.toHex(code)
    const bearer = '0x' + raw.slice(0, 40)
    const signature = '0x' + raw.slice(40, 170)
    const msg = Web3.utils.hexToAscii('0x' + raw.slice(170, raw.length))
    const campaign = getCampaign(msg, bearer)
    if (!/^0x[0-9a-f]{40}$/i.test(campaign)) throw new Error('Invalid Rouge QR code')
    if (/^0x[0-9a-f]{40}$/i.test(bearer) &&
        /^0x[0-9a-f]{130}$/i.test(signature)) {
      if (checkSignature(msg, campaign, bearer, signature)) {
        return {msg, campaign, bearer}
      } else {
        throw new Error('Invalid Rouge QR signature')
      }
    } else {
      throw new Error('Invalid Rouge QR code')
    }
  }

  return Object.freeze({
    authHash, authHashProtocolSig, authHashRpcSig, rougeQR, decodeRougeQR
  })
}

export default RougeUtils
