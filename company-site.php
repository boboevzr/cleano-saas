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
$ctx = stream_context_create(['http' => ['timeout' => 2]]);

$resolveJson = @file_get_contents($apiBase . '/company/resolve?slug=' . urlencode($slug), false, $ctx);
if ($resolveJson !== false) {
    $company = json_decode($resolveJson, true);
    if (is_array($company) && !empty($company['name'])) {
        $ogTitle = $company['name'] . ' — Химчистка ковров и мебели на дому';

        $settingsJson = @file_get_contents($apiBase . '/settings/site?company_slug=' . urlencode($slug), false, $ctx);
        if ($settingsJson !== false) {
            $settings = json_decode($settingsJson, true);
            $about = $settings['settings']['footer_about_ru'] ?? null;
            if (!empty($about)) $ogDesc = $about;
        }
    }
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
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
echo $html;
