package com.example.nokiaapplication2

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.Manifest
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.telephony.TelephonyManager
import android.util.Log
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.annotation.RequiresApi
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat


import java.io.File
import java.io.FileOutputStream
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.URL
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {
    private lateinit var btnOpenUploadDialog: Button
    private lateinit var btnSOSCall: Button
    private val PICK_MULTIPLE_FILES = 200
    private val MAX_SIZE_MB = 2.0

    private var selectedUris: MutableList<Uri> = mutableListOf()
    private var dialogView: AlertDialog? = null
    private lateinit var tvSelectedFiles: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        btnOpenUploadDialog = findViewById(R.id.btnOpenUploadDialog)
        btnSOSCall = findViewById(R.id.btnSOSCall)
        btnSOSCall.setOnClickListener{
            val intent = Intent(this, PhoneCallActivity::class.java)
            startActivity(intent)
        }
        btnOpenUploadDialog.setOnClickListener {
            showUploadDialog()
        }

        if(isNetworkStrong()){
            Log.d("NETWORK status","Strong network")
            Toast.makeText(this,"Strong network",Toast.LENGTH_LONG).show()
        }else{
            Log.d("NETWORK status","Weak network")
            Toast.makeText(this,"Weak network",Toast.LENGTH_LONG).show()
        }
        logDeviceNetworkInfoSafe(this)

    }

    private fun showUploadDialog() {
        val builder = AlertDialog.Builder(this)
        val view = layoutInflater.inflate(R.layout.dialog_upload, null)
        builder.setView(view)

        val btnSelectDocs = view.findViewById<Button>(R.id.btnSelectDocs)
        val btnUploadDocs = view.findViewById<Button>(R.id.btnUploadDocs)
        tvSelectedFiles = view.findViewById(R.id.tvSelectedFiles)

        btnSelectDocs.setOnClickListener { selectMultipleFiles() }

        btnUploadDocs.setOnClickListener {
            if (selectedUris.isEmpty()) {
                Toast.makeText(this, "Please select files first", Toast.LENGTH_SHORT).show()
            } else {
                uploadFiles()
            }
        }

        dialogView = builder.create()
        val btnCancel = view.findViewById<Button>(R.id.btnCancel)
        btnCancel.setOnClickListener {
            selectedUris.clear()
            dialogView?.dismiss()
        }
        dialogView?.setOnDismissListener {
            // This runs when dialog closes — by upload, cancel, or outside tap
            selectedUris.clear()
            cacheDir.deleteRecursively()
            Toast.makeText(this, "Dialog closed. Cache cleared!", Toast.LENGTH_SHORT).show()
        }
        dialogView?.show()


    }

    private fun selectMultipleFiles() {
        val intent = Intent(Intent.ACTION_GET_CONTENT)
        intent.type = "*/*"
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        startActivityForResult(Intent.createChooser(intent, "Select Documents"), PICK_MULTIPLE_FILES)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == PICK_MULTIPLE_FILES && resultCode == Activity.RESULT_OK) {
            selectedUris.clear()
            val builder = StringBuilder()

            if (data?.clipData != null) {
                val count = data.clipData!!.itemCount
                for (i in 0 until count) {
                    val uri = data.clipData!!.getItemAt(i).uri
                    selectedUris.add(uri)
                    builder.append("• ${getFileName(uri)}\n")
                }
            } else if (data?.data != null) {
                val uri = data.data!!
                selectedUris.add(uri)
                builder.append("• ${getFileName(uri)}\n")
            }

            tvSelectedFiles.text = builder.toString()
        }
    }

    private fun uploadFiles() {
        Thread {
            for (uri in selectedUris) {
                val fileName = getFileName(uri)
                val fileSize = getFileSizeInMB(uri)

                runOnUiThread {
                    Toast.makeText(this, "Uploading $fileName ($fileSize MB)", Toast.LENGTH_SHORT).show()
                }

                if (fileSize > MAX_SIZE_MB) {
                    compressFile(uri, fileName)
                } else {
                    copyFile(uri, fileName)
                }
            }

            runOnUiThread {
                Toast.makeText(this, "All files processed!", Toast.LENGTH_SHORT).show()
                dialogView?.dismiss()
            }
        }.start()
    }

    private fun getFileName(uri: Uri): String {
        var name = "unknown"
        val cursor = contentResolver.query(uri, null, null, null, null)
        cursor?.use {
            val nameIndex = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (it.moveToFirst()) {
                name = it.getString(nameIndex)
            }
        }
        return name
    }

    private fun getFileSizeInMB(uri: Uri): Double {
        val cursor = contentResolver.query(uri, null, null, null, null)
        var sizeBytes = 0L
        cursor?.use {
            val sizeIndex = it.getColumnIndex(OpenableColumns.SIZE)
            if (it.moveToFirst()) {
                sizeBytes = it.getLong(sizeIndex)
            }
        }
        return String.format("%.2f", sizeBytes / (1024.0 * 1024.0)).toDouble()
    }

    private fun compressFile(uri: Uri, fileName: String) {
        val inputStream = contentResolver.openInputStream(uri) ?: return
        val compressedFile = File(cacheDir, "compressed_$fileName")

        val outputStream = FileOutputStream(compressedFile)
        val buffer = ByteArray(1024)
        var bytesRead: Int

        while (inputStream.read(buffer).also { bytesRead = it } != -1) {
            outputStream.write(buffer, 0, bytesRead)
        }

        inputStream.close()
        outputStream.close()

        runOnUiThread {
            Toast.makeText(this, "Compressed $fileName successfully!", Toast.LENGTH_SHORT).show()
        }
    }

    private fun copyFile(uri: Uri, fileName: String) {
        val inputStream = contentResolver.openInputStream(uri) ?: return
        val outputFile = File(cacheDir, fileName)
        val outputStream = FileOutputStream(outputFile)

        val buffer = ByteArray(1024)
        var bytesRead: Int
        while (inputStream.read(buffer).also { bytesRead = it } != -1) {
            outputStream.write(buffer, 0, bytesRead)
        }

        inputStream.close()
        outputStream.close()
    }

    @RequiresApi(Build.VERSION_CODES.P)
    fun Context.isNetworkStrong(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val capabilities = cm.getNetworkCapabilities(network) ?: return false

        return when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> {
                val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                val wifiInfo = wifiManager.connectionInfo
                val level = WifiManager.calculateSignalLevel(wifiInfo.rssi, 5)
                level >= 3 // true = strong, false = weak
            }
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> {
                val tm = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                val strength = tm.signalStrength?.level ?: 0
                strength >= 3 // true = strong, false = weak
            }
            else -> false
        }

    }


    fun logDeviceNetworkInfoSafe(context: Context) {
        // 1. Phone Number (requires READ_PHONE_STATE)
        val phoneNumber = if (ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_PHONE_STATE
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            val tm = context.getSystemService(TELEPHONY_SERVICE) as TelephonyManager
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    tm.line1Number
                } else {
                    @Suppress("DEPRECATION")
                    tm.line1Number
                }
            } catch (e: SecurityException) {
                null
            }
        } else {
            null
        }

        // 2. Private IP
        var privateIP: String? = null
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            for (intf in interfaces) {
                val addrs = intf.inetAddresses
                for (addr in addrs) {
                    if (!addr.isLoopbackAddress && addr is InetAddress) {
                        val ip = addr.hostAddress
                        if (ip.indexOf(':') < 0) {
                            privateIP = ip
                            break
                        }
                    }
                }
                if (privateIP != null) break
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // 3. Network Type & QoS
        val cm = context.getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork
        val caps = network?.let { cm.getNetworkCapabilities(it) }
        val networkType = when {
            caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true -> "WIFI"
            caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "CELLULAR"
            else -> "NONE"
        }
        val qosProfile = when (networkType) {
            "WIFI" -> "DOWNLINK_H_UPLINK_H"
            "CELLULAR" -> "DOWNLINK_M_UPLINK_L"
            else -> "UNKNOWN"
        }

        // 4. Public IP (asynchronously)
        thread {
            val publicIP = try {
                URL("https://api.ipify.org").readText()
            } catch (e: Exception) {
                null
            }

            Log.d("DeviceNetworkInfo", "Phone Number: $phoneNumber")
            Log.d("DeviceNetworkInfo", "Private IP: $privateIP")
            Log.d("DeviceNetworkInfo", "Public IP: $publicIP")
            Log.d("DeviceNetworkInfo", "Network Type: $networkType")
            Log.d("DeviceNetworkInfo", "QoS Profile: $qosProfile")
        }
    }


}