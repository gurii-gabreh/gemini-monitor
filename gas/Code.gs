// ============================================================
// Gemini API 混雑測定ツール - GAS バックエンド
// ============================================================

// ============================================================
// 定数・設定
// ============================================================
const CONFIG = {
  GEMINI_API_KEY: '', // ← ここにGemini APIキーを入力
  SHEET_NAME: 'measurements',
  SETTINGS_SHEET: 'settings',

  // 測定プロンプト（小・中・大）
  PROMPTS: {
    small: {
      label: '小',
      text: '1+1=?',
      expectedTokens: 10
    },
    medium: {
      label: '中',
      text: '日本の四季について、それぞれの特徴を3文で説明してください。',
      expectedTokens: 300
    },
    large: {
      label: '大',
      text: `以下のテーマについて詳しく説明してください：
1. 人工知能の歴史と発展（1950年代から現在まで）
2. 機械学習の主要アルゴリズム（教師あり学習、教師なし学習、強化学習）
3. 深層学習の仕組みとニューラルネットワーク
4. 現在のAI活用事例（医療、金融、製造業、エンターテインメント）
5. AIの倫理的課題と将来展望
各項目について500文字程度で詳述してください。`,
      expectedTokens: 3000
    }
  },

  // デフォルト対象モデル
  DEFAULT_MODELS: [
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro'
  ]
};

// ============================================================
// Web API エンドポイント（GitHub PagesのHTMLから呼び出し）
// ============================================================
function doGet(e) {
  const action = e.parameter.action || 'getData';

  let result;
  try {
    if (action === 'getData') {
      result = getMeasurementData(e.parameter);
    } else if (action === 'getSettings') {
      result = getSettings();
    } else if (action === 'saveSettings') {
      result = saveSettings(e.parameter);
    } else if (action === 'runNow') {
      runMeasurement();
      result = { success: true, message: '測定を開始しました' };
    } else {
      result = { error: '不明なアクションです: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// 測定データ取得
// ============================================================
function getMeasurementData(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return { data: [], columns: [] };

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { data: [], columns: getColumns() };

  const range = sheet.getRange(2, 1, lastRow - 1, getColumns().length);
  const values = range.getValues();

  // フィルタ（モデル・期間）
  const filterModel = params.model || 'all';
  const filterPeriod = params.period || 'day'; // day/week/month/year
  const now = new Date();
  const cutoff = getPeriodCutoff(now, filterPeriod);

  const data = values
    .map(row => ({
      timestamp:    row[0] ? new Date(row[0]).getTime() : null,
      model:        row[1],
      size:         row[2],
      status:       row[3], // 'success' | 'error' | 'rate_limit'
      latency_ms:   row[4],
      tokens_input: row[5],
      tokens_output:row[6],
      error_code:   row[7],
      jst_hour:     row[8]
    }))
    .filter(row => {
      if (!row.timestamp) return false;
      if (row.timestamp < cutoff) return false;
      if (filterModel !== 'all' && row.model !== filterModel) return false;
      return true;
    });

  return { data, columns: getColumns() };
}

function getColumns() {
  return ['timestamp','model','size','status','latency_ms',
          'tokens_input','tokens_output','error_code','jst_hour'];
}

function getPeriodCutoff(now, period) {
  const d = new Date(now);
  switch(period) {
    case 'day':   d.setDate(d.getDate() - 1);   break;
    case 'week':  d.setDate(d.getDate() - 7);   break;
    case 'month': d.setMonth(d.getMonth() - 1); break;
    case 'year':  d.setFullYear(d.getFullYear() - 1); break;
    default:      d.setDate(d.getDate() - 1);
  }
  return d.getTime();
}

// ============================================================
// 設定取得・保存
// ============================================================
function getSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET);
  if (!sheet) {
    return {
      enabled_models: CONFIG.DEFAULT_MODELS,
      interval_hours: 1,
      sizes: ['small', 'medium', 'large']
    };
  }

  const values = sheet.getDataRange().getValues();
  const settings = {};
  values.forEach(row => {
    if (row[0]) {
      try { settings[row[0]] = JSON.parse(row[1]); }
      catch(e) { settings[row[0]] = row[1]; }
    }
  });

  return {
    enabled_models: settings.enabled_models || CONFIG.DEFAULT_MODELS,
    interval_hours: settings.interval_hours || 1,
    sizes: settings.sizes || ['small', 'medium', 'large']
  };
}

function saveSettings(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SETTINGS_SHEET);
  }
  sheet.clearContents();

  const models = params.models ? params.models.split(',') : CONFIG.DEFAULT_MODELS;
  const interval = parseInt(params.interval) || 1;
  const sizes = params.sizes ? params.sizes.split(',') : ['small','medium','large'];

  sheet.getRange(1, 1, 3, 2).setValues([
    ['enabled_models', JSON.stringify(models)],
    ['interval_hours', JSON.stringify(interval)],
    ['sizes',          JSON.stringify(sizes)]
  ]);

  // トリガー再設定
  resetTrigger(interval);

  return { success: true, message: '設定を保存しました' };
}

// ============================================================
// トリガー管理
// ============================================================
function resetTrigger(intervalHours) {
  // 既存トリガー削除
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'runMeasurement') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // 新しいトリガー設定
  ScriptApp.newTrigger('runMeasurement')
    .timeBased()
    .everyHours(Math.max(1, Math.min(24, intervalHours)))
    .create();
}

function setupInitialTrigger() {
  resetTrigger(1);
  Logger.log('初期トリガー設定完了（1時間毎）');
}

// ============================================================
// 測定メイン処理
// ============================================================
function runMeasurement() {
  const settings = getSettings();
  const models   = settings.enabled_models;
  const sizes    = settings.sizes;

  Logger.log(`測定開始: モデル=${models.join(',')}, サイズ=${sizes.join(',')}`);

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    // ヘッダー設定
    sheet.getRange(1, 1, 1, getColumns().length).setValues([getColumns()]);
    sheet.getRange(1, 1, 1, getColumns().length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  const now     = new Date();
  const jstHour = getJSTHour(now);
  const rows    = [];

  // モデル × サイズ の全組合せを測定
  // 2.5-proはRPD制限が厳しいため小サイズのみ測定
  for (const model of models) {
    const targetSizes = model.includes('pro') ? ['small'] : sizes;
    for (const size of targetSizes) {
      const result = callGeminiAPI(model, size);
      rows.push([
        now,
        model,
        size,
        result.status,
        result.latency_ms,
        result.tokens_input  || 0,
        result.tokens_output || 0,
        result.error_code    || '',
        jstHour
      ]);
      // レート制限対策：モデル間で少し待機
      Utilities.sleep(2000);
    }
  }

  if (rows.length > 0) {
    const lastRow = Math.max(sheet.getLastRow(), 1);
    sheet.getRange(lastRow + 1, 1, rows.length, getColumns().length).setValues(rows);
    Logger.log(`測定完了: ${rows.length}件記録`);
  }
}

// ============================================================
// Gemini API呼び出し（小中大）
// ============================================================
function callGeminiAPI(model, size) {
  const apiKey = CONFIG.GEMINI_API_KEY;
  if (!apiKey) {
    return { status: 'error', latency_ms: 0, error_code: 'NO_API_KEY' };
  }

  const prompt = CONFIG.PROMPTS[size];
  if (!prompt) {
    return { status: 'error', latency_ms: 0, error_code: 'INVALID_SIZE' };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt.text }] }],
    generationConfig: { maxOutputTokens: prompt.expectedTokens }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const startTime = Date.now();
  let response, latency_ms, result;

  try {
    response   = UrlFetchApp.fetch(url, options);
    latency_ms = Date.now() - startTime;
    const code = response.getResponseCode();
    const body = JSON.parse(response.getContentText());

    if (code === 200) {
      const usage = body.usageMetadata || {};
      result = {
        status:        'success',
        latency_ms,
        tokens_input:  usage.promptTokenCount    || 0,
        tokens_output: usage.candidatesTokenCount || 0,
        error_code:    ''
      };
    } else if (code === 429) {
      result = {
        status: 'rate_limit',
        latency_ms,
        error_code: '429_RATE_LIMIT'
      };
    } else if (code === 503) {
      result = {
        status: 'error',
        latency_ms,
        error_code: `503_SERVICE_UNAVAILABLE`
      };
    } else {
      const errMsg = body.error ? body.error.message : `HTTP_${code}`;
      result = {
        status: 'error',
        latency_ms,
        error_code: `${code}_${errMsg}`.substring(0, 100)
      };
    }
  } catch (err) {
    latency_ms = Date.now() - startTime;
    result = {
      status: 'error',
      latency_ms,
      error_code: ('EXCEPTION: ' + err.message).substring(0, 100)
    };
  }

  Logger.log(`[${model}][${size}] ${result.status} ${result.latency_ms}ms`);
  return result;
}

// ============================================================
// ユーティリティ
// ============================================================
function getJSTHour(date) {
  // JSTはUTC+9
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCHours();
}

// ============================================================
// 初期セットアップ（手動で一度だけ実行）
// ============================================================
function initialSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // measurementsシート作成
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.getRange(1, 1, 1, getColumns().length).setValues([getColumns()]);
    sheet.getRange(1, 1, 1, getColumns().length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    Logger.log('measurementsシート作成完了');
  }

  // settingsシート作成
  let settingsSheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(CONFIG.SETTINGS_SHEET);
    settingsSheet.getRange(1, 1, 3, 2).setValues([
      ['enabled_models', JSON.stringify(CONFIG.DEFAULT_MODELS)],
      ['interval_hours', '1'],
      ['sizes',          JSON.stringify(['small','medium','large'])]
    ]);
    settingsSheet.getRange(1, 1, 3, 1).setFontWeight('bold');
    Logger.log('settingsシート作成完了');
  }

  // 初期トリガー設定
  setupInitialTrigger();

  Logger.log('初期セットアップ完了！次にAPIキーをCONFIG.GEMINI_API_KEYに設定し、runMeasurementを手動実行してテストしてください。');
}
