<?php
// Серверная подмена og:title / description / meta description под конкретную
// компанию — ДО того как страница уйдёт краулеру (Telegram/WhatsApp/FB не
// выполняют JS, поэтому JS-подмена в site-common.js для них бесполезна).
// Живым посетителям ничего не меняется — тот же company-site.html, тот же JS
// поверх него как и раньше. При любой ошибке (API недоступен, компания не
// найдена) — молча отдаём файл как есть, с дефолтными ARTEZ-текстами.

$slug = 'artez';
$host = $_SERVER['HTTP_HOST'] ?? '';
if (preg_match('/^([a-z0-9-]+)\.cleano\.uz$/i', $host, $m) && strtolower($m[1]) !== 'www') {
    $slug = strtolower($m[1]);
}

$defaultTitle = 'ARTEZ — Химчистка ковров и мебели на дому';
$defaultDesc  = 'Химчистка ковров, мягкой мебели, матрасов и штор на дому. Вывоз и доставка.';
$ogTitle = $defaultTitle;
$ogDesc  = $defaultDesc;

$apiBase = 'https://web-production-eef2a.up.railway.app/api';

// file_get_contents(url) требует allow_url_fopen — на части shared-хостингов он
// выключен из соображений безопасности. cURL почти всегда доступен и не зависит
// от этой настройки, поэтому он в приоритете; file_get_contents оставлен как
// резервный вариант на случай хостинга без cURL.
function _fetchJson(string $url): ?array {
    $body = false;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 3,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER     => ['Accept: application/json'],
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($body === false || $code < 200 || $code >= 300) $body = false;
    }
    if ($body === false && ini_get('allow_url_fopen')) {
        $ctx = stream_context_create(['http' => ['timeout' => 3]]);
        $body = @file_get_contents($url, false, $ctx);
    }
    if ($body === false) return null;
    $data = json_decode($body, true);
    return is_array($data) ? $data : null;
}

$company = _fetchJson($apiBase . '/company/resolve?slug=' . urlencode($slug));
if ($company && !empty($company['name'])) {
    $ogTitle = $company['name'] . ' — Химчистка ковров и мебели на дому';

    $settings = _fetchJson($apiBase . '/settings/site?company_slug=' . urlencode($slug));
    $about = $settings['settings']['footer_about_ru'] ?? null;
    if (!empty($about)) $ogDesc = $about;
}

$html = @file_get_contents(__DIR__ . '/company-site.html');
if ($html === false) {
    http_response_code(500);
    echo 'Site temporarily unavailable';
    exit;
}

if ($ogTitle !== $defaultTitle || $ogDesc !== $defaultDesc) {
    $html = str_replace(
        '<meta property="og:title" id="metaOgTitle" content="' . $defaultTitle . '">',
        '<meta property="og:title" id="metaOgTitle" content="' . htmlspecialchars($ogTitle, ENT_QUOTES) . '">',
        $html
    );
    $html = str_replace(
        '<meta name="description" id="metaDescription" data-i18n-content="meta.description" content="' . $defaultDesc . '">',
        '<meta name="description" id="metaDescription" data-i18n-content="meta.description" content="' . htmlspecialchars($ogDesc, ENT_QUOTES) . '">',
        $html
    );
    $html = str_replace(
        '<meta property="og:description" id="metaOgDescription" content="' . $defaultDesc . '">',
        '<meta property="og:description" id="metaOgDescription" content="' . htmlspecialchars($ogDesc, ENT_QUOTES) . '">',
        $html
    );
    // <title> — та же замена, чтобы вкладка браузера тоже не мигала ARTEZ.
    $html = str_replace(
        '<title data-i18n="meta.title">' . $defaultTitle . '</title>',
        '<title data-i18n="meta.title">' . htmlspecialchars($ogTitle, ENT_QUOTES) . '</title>',
        $html
    );
}

// Отдаём уже полученные от API данные компании прямо в JS (window.__PRESET_COMPANY__) —
// site-common.js подхватывает их вместо повторного похода в API с браузера. Раньше между
// первой отрисовкой (со статичным ARTEZ) и завершением JS-запроса к /company/resolve
// проходило 1-2 секунды, за которые видно было название/логотип ARTEZ — теперь эти данные
// уже в HTML при первой отрисовке.
if ($company && !empty($company['name'])) {
    $preset = json_encode([
        'name'     => $company['name'],
        'slug'     => $company['slug'] ?? $slug,
        'logo_url' => $company['logo_url'] ?? null,
        'site_template_key' => $company['site_template_key'] ?? null,
        'site_palette_key'  => $company['site_palette_key'] ?? null,
        'palette_colors'    => $company['palette_colors'] ?? null,
    ], JSON_UNESCAPED_UNICODE);
    // JSON_UNESCAPED_SLASHES сознательно НЕ включён — экранированный "\/" не даёт
    // значению вида "</script>" (например, вредоносное название компании) преждевременно
    // закрыть этот <script> тег; для JSON.parse/JS-литерала разницы в поведении нет.
    $html = str_replace('<head>', "<head>\n<script>window.__PRESET_COMPANY__=" . $preset . ";</script>", $html);
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
echo $html;
