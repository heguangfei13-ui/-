param([Parameter(Mandatory=$true)][string]$Url, [string]$FormBody = '')

# Native Windows TLS, verified certificates, no redirects and a 25-second request timeout.
# Only the allow-listed Python caller supplies URLs. Nothing is written to disk here.
$ErrorActionPreference = 'Stop'
$options = @{Uri=$Url; TimeoutSec=25; MaximumRedirection=0; UserAgent='HomeCompass/1.0 public-source daily research'}
if ($FormBody) {
    $options.Method = 'Post'
    $options.Body = $FormBody
    $options.ContentType = 'application/x-www-form-urlencoded'
}
try {
    $response = Invoke-WebRequest @options
    if ([int]$response.StatusCode -ne 200) {
        [Console]::Error.WriteLine('HTTP_STATUS:' + [int]$response.StatusCode)
        exit 1
    }
    if ($response.RawContentStream.Length -gt 24000000) { throw 'source too large' }
    $response.RawContentStream.Position = 0
    $response.RawContentStream.CopyTo([Console]::OpenStandardOutput())
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    if ($status -ge 300) { [Console]::Error.WriteLine('HTTP_STATUS:' + $status) }
    else { [Console]::Error.WriteLine('TRANSPORT_INCOMPLETE') }
    exit 1
}
