package com.scribeai.client

import android.content.Context
import android.util.Log
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.nio.FloatBuffer
import java.util.ArrayDeque

/**
 * DTLN 实时降噪（ONNX Runtime，breizhn/DTLN 预训练模型）。
 * block_len=512, block_shift=128, 16kHz。
 */
class DtlnNoiseSuppressor(private val context: Context) {
    private var env: OrtEnvironment? = null
    private var session1: OrtSession? = null
    private var session2: OrtSession? = null

    private var state1: OnnxTensor? = null
    private var state2: OnnxTensor? = null

    private val inBuffer = FloatArray(BLOCK_LEN)
    private val outBuffer = FloatArray(BLOCK_LEN)
    private val inMag = FloatArray(BLOCK_LEN / 2 + 1)
    private val inPhase = FloatArray(BLOCK_LEN / 2 + 1)
    private val scratchMag = FloatArray(BLOCK_LEN / 2 + 1)

    private val inputFifo = FloatArray(BLOCK_SHIFT)
    private var fifoPos = 0
    private val outputFifo = ArrayDeque<Short>(BLOCK_SHIFT * 4)

    var isReady: Boolean = false
        private set

    var lastError: String? = null
        private set

    fun initialize(): Boolean {
        release()
        return try {
            val environment = OrtEnvironment.getEnvironment()
            val opts = OrtSession.SessionOptions().apply {
                setIntraOpNumThreads(2)
                setInterOpNumThreads(1)
                setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
            }

            val bytes1 = context.assets.open("dtln/model_1.onnx").use { it.readBytes() }
            val bytes2 = context.assets.open("dtln/model_2.onnx").use { it.readBytes() }

            env = environment
            session1 = environment.createSession(bytes1, opts)
            session2 = environment.createSession(bytes2, opts)
            state1 = createZeroTensor(environment, longArrayOf(1, 2, 128, 2))
            state2 = createZeroTensor(environment, longArrayOf(1, 2, 128, 2))

            inBuffer.fill(0f)
            outBuffer.fill(0f)
            fifoPos = 0
            outputFifo.clear()
            isReady = true
            lastError = null
            Log.i(TAG, "DTLN models loaded")
            true
        } catch (e: Exception) {
            lastError = e.message ?: "DTLN init failed"
            Log.e(TAG, "DTLN init failed", e)
            release()
            false
        }
    }

    /** PCM16 → 降噪后 PCM16（DTLN 有约 32ms 启动延迟，初期可能为静音） */
    @Synchronized
    fun processPcm16(input: ShortArray, count: Int, out: ShortArray): Int {
        if (!isReady) {
            System.arraycopy(input, 0, out, 0, count)
            return count
        }

        for (i in 0 until count) {
            inputFifo[fifoPos++] = input[i] / 32768f
            if (fifoPos < BLOCK_SHIFT) continue

            val blockOut = processBlock(inputFifo)
            fifoPos = 0
            for (s in blockOut) {
                val sample = (s.coerceIn(-1f, 1f) * 32767f).toInt()
                    .coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
                    .toShort()
                outputFifo.add(sample)
            }
        }

        var written = 0
        while (written < count) {
            val sample = outputFifo.pollFirst()
            out[written++] = sample ?: 0
        }
        return count
    }

    private fun processBlock(newSamples: FloatArray): FloatArray {
        System.arraycopy(inBuffer, BLOCK_SHIFT, inBuffer, 0, BLOCK_LEN - BLOCK_SHIFT)
        System.arraycopy(newSamples, 0, inBuffer, BLOCK_LEN - BLOCK_SHIFT, BLOCK_SHIFT)

        val (mag, phase) = DtlnRealFft.rfft(inBuffer)
        System.arraycopy(mag, 0, inMag, 0, mag.size)
        System.arraycopy(phase, 0, inPhase, 0, phase.size)

        val environment = env ?: return FloatArray(BLOCK_SHIFT)
        val s1 = session1 ?: return FloatArray(BLOCK_SHIFT)
        val s2 = session2 ?: return FloatArray(BLOCK_SHIFT)

        val input2 = OnnxTensor.createTensor(environment, FloatBuffer.wrap(inMag), SHAPE_MAG)
        val outputs1 = s1.run(mapOf(INPUT_2 to input2, INPUT_3 to state1))
        input2.close()

        val outMask = (outputs1[0].value as Array<Array<FloatArray>>)[0][0]
        state1?.close()
        state1 = outputs1[1] as OnnxTensor
        outputs1[0].close()

        for (i in scratchMag.indices) {
            scratchMag[i] = inMag[i] * outMask[i]
        }

        val estimatedBlock = DtlnRealFft.irfft(scratchMag, inPhase)

        val input4 = OnnxTensor.createTensor(environment, FloatBuffer.wrap(estimatedBlock), SHAPE_TIME)
        val outputs2 = s2.run(mapOf(INPUT_4 to input4, INPUT_5 to state2))
        input4.close()

        val outBlock = (outputs2[0].value as Array<Array<FloatArray>>)[0][0]
        state2?.close()
        state2 = outputs2[1] as OnnxTensor
        outputs2[0].close()

        System.arraycopy(outBuffer, BLOCK_SHIFT, outBuffer, 0, BLOCK_LEN - BLOCK_SHIFT)
        for (i in BLOCK_LEN - BLOCK_SHIFT until BLOCK_LEN) {
            outBuffer[i] = 0f
        }
        for (i in outBlock.indices) {
            outBuffer[i] += outBlock[i]
        }

        return outBuffer.copyOfRange(0, BLOCK_SHIFT)
    }

    @Synchronized
    fun release() {
        try {
            state1?.close()
            state2?.close()
            session1?.close()
            session2?.close()
        } catch (e: Exception) {
            Log.w(TAG, "DTLN release warning", e)
        } finally {
            state1 = null
            state2 = null
            session1 = null
            session2 = null
            env = null
            isReady = false
            fifoPos = 0
            outputFifo.clear()
        }
    }

    private fun createZeroTensor(environment: OrtEnvironment, shape: LongArray): OnnxTensor {
        val size = shape.fold(1L) { acc, v -> acc * v }.toInt()
        return OnnxTensor.createTensor(environment, FloatBuffer.allocate(size), shape)
    }

    companion object {
        private const val TAG = "DtlnNoiseSuppressor"
        private const val BLOCK_LEN = 512
        private const val BLOCK_SHIFT = 128
        private const val INPUT_2 = "input_2"
        private const val INPUT_3 = "input_3"
        private const val INPUT_4 = "input_4"
        private const val INPUT_5 = "input_5"
        private val SHAPE_MAG = longArrayOf(1, 1, 257)
        private val SHAPE_TIME = longArrayOf(1, 1, 512)
    }
}
