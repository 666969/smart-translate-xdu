param(
  [ValidateRange(1024, 65535)][int] $SitePort = 3000,
  [ValidateRange(1024, 65535)][int] $SpeechPort = 8765
)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$cache = Join-Path $env:LOCALAPPDATA 'ZhiyiXidian/speech'
$release = 'v1.9.2'
$package = Join-Path $cache "whisper-$release-x64.zip"
$binaryDir = Join-Path $cache $release
$server = Join-Path $binaryDir 'Release/whisper-server.exe'
$model = Join-Path $cache 'ggml-base-q5_1.bin'

function Get-VerifiedFile([string] $Uri, [string] $Destination, [string] $Sha256) {
  if (!(Test-Path -LiteralPath $Destination) -or
      (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -ne $Sha256) {
    Invoke-WebRequest -Uri $Uri -OutFile $Destination -TimeoutSec 240
    if ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -ne $Sha256) {
      throw '下载校验失败，请重试。'
    }
  }
}

function Test-SpeechPort {
  $connection = [System.Net.Sockets.TcpClient]::new()
  try {
    $connection.Connect('127.0.0.1', $SpeechPort)
    return $true
  } catch {
    return $false
  } finally {
    $connection.Dispose()
  }
}

if ($SitePort -eq $SpeechPort) { throw '网站与转写服务需要使用不同端口。' }
if (Test-SpeechPort) { throw "语音转写端口 $SpeechPort 已被占用，请用 -SpeechPort 指定其他端口。" }
New-Item -ItemType Directory -Path $cache -Force | Out-Null
if (!(Test-Path -LiteralPath $server)) {
  Write-Host '准备本机语音转写工具…'
  Get-VerifiedFile "https://github.com/ggml-org/whisper.cpp/releases/download/$release/whisper-bin-x64.zip" $package '49DCC16DE826F20BD53D44F947A1AE49DFA81F86CAD67A64D80820CB192D674A'
  Expand-Archive -LiteralPath $package -DestinationPath $binaryDir -Force
}
Write-Host '检查法语、英语共用的语音模型…'
Get-VerifiedFile 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin?download=true' $model '422F1AE452ADE6F30A004D7E5C6A43195E4433BC370BF23FAC9CC591F01A8898'

$priorUrl = $env:OPENAI_TRANSCRIBE_BASE_URL
$priorKey = $env:OPENAI_TRANSCRIBE_API_KEY
$priorModel = $env:OPENAI_TRANSCRIBE_MODEL
$speechProcess = $null
Push-Location -LiteralPath $project
try {
  $launch = @{
    FilePath = $server
    ArgumentList = @('-m', ('"' + $model + '"'), '--host', '127.0.0.1', '--port', $SpeechPort,
      '--inference-path', '/v1/audio/transcriptions', '-l', 'fr', '-t', '3', '-ng')
    WorkingDirectory = (Split-Path -Parent $server)
    WindowStyle = 'Hidden'
    PassThru = $true
    RedirectStandardOutput = (Join-Path $cache 'whisper-out.log')
    RedirectStandardError = (Join-Path $cache 'whisper-error.log')
  }
  $speechProcess = Start-Process @launch
  $ready = $false
  for ($attempt = 0; $attempt -lt 25 -and !$ready; $attempt++) {
    if ($speechProcess.HasExited) { throw "语音服务启动失败，请查看 $cache 下的 whisper-error.log。" }
    $ready = Test-SpeechPort
    if (!$ready) { Start-Sleep -Milliseconds 350 }
  }
  if (!$ready -or $speechProcess.HasExited) { throw '语音模型启动失败，请检查日志。' }
  $env:OPENAI_TRANSCRIBE_BASE_URL = "http://127.0.0.1:$SpeechPort/v1"
  $env:OPENAI_TRANSCRIBE_API_KEY = 'local-whisper'
  $env:OPENAI_TRANSCRIBE_MODEL = 'whisper-1'
  Write-Host "本机语音转写已就绪。浏览器打开 http://localhost:$SitePort/live"
  & npm.cmd run dev -- --hostname 127.0.0.1 --port $SitePort
  if ($LASTEXITCODE -ne 0) { throw '网站启动失败，请查看终端输出。' }
} finally {
  if ($speechProcess -and !$speechProcess.HasExited) { $speechProcess.Kill() }
  $env:OPENAI_TRANSCRIBE_BASE_URL = $priorUrl
  $env:OPENAI_TRANSCRIBE_API_KEY = $priorKey
  $env:OPENAI_TRANSCRIBE_MODEL = $priorModel
  Pop-Location
}
