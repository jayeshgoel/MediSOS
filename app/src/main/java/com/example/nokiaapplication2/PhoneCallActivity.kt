package com.example.nokiaapplication2
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.databinding.DataBindingUtil
import com.example.nokiaapplication2.databinding.ActivityPhoneCallBinding
import io.agora.rtc2.ChannelMediaOptions
import io.agora.rtc2.Constants
import io.agora.rtc2.IRtcEngineEventHandler
import io.agora.rtc2.RtcEngine
import io.agora.rtc2.RtcEngineConfig

class PhoneCallActivity : AppCompatActivity() {

    private val PERMISSION_REQ_ID = 22

    private val myAppId = "d19819afaf2343a09bd52e2edcfc9ac7"
    private val channelName = "RandomChannelTest"
    private val token = "007eJxTYKgQm3O7423fzh9N+sJnYlVfKfbvPX5kcUbw1EIliRyNx6UKDCmGlhaGlolpiWlGxibGiQaWSSmmRqlGqSnJacmWicnm3zyeZTQEMjL0ZZQxMjJAIIgvyBCUmJeSn+uckZiXl5oTklpcwsAAAJiTJmU="
    private var mRtcEngine: RtcEngine? = null
    private lateinit var binding: ActivityPhoneCallBinding
    private var isMuted = false

    private val mRtcEventHandler = object : IRtcEngineEventHandler() {
        override fun onJoinChannelSuccess(channel: String?, uid: Int, elapsed: Int) {
            super.onJoinChannelSuccess(channel, uid, elapsed)
            runOnUiThread {
                showToast("Joined channel $channel")
            }
        }
        override fun onUserJoined(uid: Int, elapsed: Int) {
            runOnUiThread {
                showToast("A user joined")
            }
        }
        override fun onUserOffline(uid: Int, reason: Int) {
            super.onUserOffline(uid, reason)
            runOnUiThread {
                showToast("User offline: $uid")
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = DataBindingUtil.setContentView(this, R.layout.activity_phone_call)

        if (checkPermissions()) {
            startVoiceCalling()
        } else {
            requestPermissions()
        }
        setupUIControls()
    }

    private fun setupUIControls() {
        binding.btnMute.setOnClickListener {
            isMuted = !isMuted
            mRtcEngine?.muteLocalAudioStream(isMuted)
            binding.btnMute.setImageResource(
                if (isMuted) R.drawable.mic_off_icon else R.drawable.mic_icon
            )
        }

        binding.btnEndCall.setOnClickListener {
            cleanupAgoraEngine()
            finish()
        }
    }

    private fun checkPermissions(): Boolean {
        for (permission in getRequiredPermissions()) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                return false
            }
        }
        return true
    }

    private fun requestPermissions() {
        ActivityCompat.requestPermissions(this, getRequiredPermissions(), PERMISSION_REQ_ID)
    }

    private fun getRequiredPermissions(): Array<String> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.BLUETOOTH_CONNECT
            )
        } else {
            arrayOf(Manifest.permission.RECORD_AUDIO)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (checkPermissions()) {
            startVoiceCalling()
        }
    }

    private fun startVoiceCalling() {
        initializeAgoraVoiceSDK()
        joinChannel()
    }

    private fun initializeAgoraVoiceSDK() {
        try {
            val config = RtcEngineConfig().apply {
                mContext = baseContext
                mAppId = myAppId
                mEventHandler = mRtcEventHandler
            }
            mRtcEngine = RtcEngine.create(config)
        } catch (e: Exception) {
            throw RuntimeException("Error initializing RTC engine: ${e.message}")
        }
    }

    private fun joinChannel() {
        val options = ChannelMediaOptions().apply {
            clientRoleType = Constants.CLIENT_ROLE_BROADCASTER
            channelProfile = Constants.CHANNEL_PROFILE_COMMUNICATION
            publishMicrophoneTrack = true
        }
        mRtcEngine?.joinChannel(token, channelName, 0, options)
    }

    override fun onDestroy() {
        super.onDestroy()
        cleanupAgoraEngine()
    }

    private fun cleanupAgoraEngine() {
        mRtcEngine?.apply {
            stopPreview()
            leaveChannel()
        }
        mRtcEngine = null
    }

    private fun showToast(message: String) {
        runOnUiThread {
            Toast.makeText(this@PhoneCallActivity, message, Toast.LENGTH_SHORT).show()
            Log.d("AGORA CONNECT",message)
        }
    }
}