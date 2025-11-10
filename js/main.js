/**
 * AR 圖卡收集遊戲 (最終修正版)
 * * 功能：
 * 1. 動態版本載入 (URL 參數 ?version=v2)
 * 2. 進度儲存 (LocalStorage)
 * 3. 進度重置 (重置按鈕)
 * 4. 完成狀態 (顯示 YYYYMMDDHHMMSS 代碼)
 * 5. (修正) 解決 AR 啟動時序問題 (Race Condition)
 */

document.addEventListener('DOMContentLoaded', () => {
    
    /**
     * 從 URL 參數獲取版本號
     */
    function getVersionFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const version = urlParams.get('version');
        return version || 'v1'; // 預設為 'v1'
    }

    // --- 1. 設定檔與儲存密鑰 ---
    const CURRENT_VERSION = getVersionFromURL();
    const CONFIG_PATH = `versions/${CURRENT_VERSION}/config.json`;
    const SAVE_KEY = `arCollectionSave_${CURRENT_VERSION}`;

    // --- 2. 遊戲狀態變數 ---
    let collectionState = [];
    let totalCharacters = 0;
    let collectedCount = 0;

    // --- 3. DOM 元素快取 ---
    const sceneEl = document.querySelector('#ar-scene');
    const assetsEl = document.querySelector('a-assets');
    const thumbnailsContainer = document.getElementById('thumbnails-container');
    const qrcodeContainer = document.getElementById('qrcode-container'); 
    const resetButton = document.getElementById('reset-button');
    const completionCodeContainer = document.getElementById('completion-code-container');

    
    // --- 4. 進度管理 (LocalStorage) ---

    /**
     * 載入進度
     */
    function loadProgress(characterCount) {
        const savedData = localStorage.getItem(SAVE_KEY);
        if (savedData) {
            try {
                const parsedData = JSON.parse(savedData);
                if (Array.isArray(parsedData) && parsedData.length === characterCount) {
                    console.log('載入已儲存的進度:', parsedData);
                    return parsedData;
                } else {
                    console.warn('儲存的進度與目前版本不符，將重置。');
                    localStorage.removeItem(SAVE_KEY); 
                }
            } catch (e) {
                console.error('解析儲存資料時發生錯誤:', e);
                localStorage.removeItem(SAVE_KEY); 
            }
        }
        console.log('未找到儲存進度，建立新進度。');
        return Array(characterCount).fill(false);
    }

    /**
     * 儲存目前進度到 localStorage
     */
    function saveProgress() {
        localStorage.setItem(SAVE_KEY, JSON.stringify(collectionState));
        console.log('進度已儲存。');
    }

    /**
     * 重置進度
     */
    function resetProgress() {
        if (confirm('您確定要清除所有收集進度並重新開始嗎？')) {
            localStorage.removeItem(SAVE_KEY);
            alert('進度已清除，頁面將重新載入。');
            window.location.reload();
        }
    }


    // --- 5. 應用程式初始化 ---

    /**
     * 異步初始化 App
     */
    async function initApp() {
        let config;
        try {
            // 1. 載入設定檔
            const response = await fetch(CONFIG_PATH);
            if (!response.ok) {
                console.error(`無法載入設定檔: ${CONFIG_PATH}`);
                alert(`錯誤：找不到版本 '${CURRENT_VERSION}' 的設定檔。\n將嘗試載入預設版本 'v1'。`);
                
                const v1_CONFIG_PATH = `versions/v1/config.json`;
                const v1_response = await fetch(v1_CONFIG_PATH);
                if (!v1_response.ok) throw new Error(`連預設版本 'v1' 都載入失敗。`);
                config = await v1_response.json();
            } else {
                 config = await response.json();
            }

            // 2. 設定遊戲狀態 (從 localStorage 載入)
            totalCharacters = config.characters.length;
            collectionState = loadProgress(totalCharacters);
            collectedCount = collectionState.filter(Boolean).length;

            // --- (!!! 關鍵的正確順序 !!!) ---
            
            // 3. (先) 動態生成所有 HTML 元素 (縮圖、Assets、AR 實體)
            //    並且 *立刻綁定* 事件監聽
            config.characters.forEach((char, index) => {
                
                // 3.1. 建立縮圖
                const thumbImg = document.createElement('img');
                thumbImg.id = `thumb-${index}`;
                thumbImg.className = 'thumbnail';
                thumbImg.src = char.thumb;
                thumbnailsContainer.appendChild(thumbImg);

                if (collectionState[index]) {
                    thumbImg.style.opacity = '1';
                }

                // 3.2. 建立 <a-assets> 內的 <img>
                const assetImg = document.createElement('img');
                const assetId = `char-asset-${index}`;
                assetImg.id = assetId;
                assetImg.src = char.char;
                assetsEl.appendChild(assetImg);

                // 3.3. 建立 <a-entity> (AR 目標)
                const entity = document.createElement('a-entity');
                entity.setAttribute('mindar-image-target', `targetIndex: ${index}`);
                
                // 3.4. 建立 <a-image> (顯示的角色圖片)
                const charImage = document.createElement('a-image');
                charImage.className = 'character-image';
                charImage.setAttribute('src', `#${assetId}`); 
                charImage.setAttribute('position', '0 0 0');
                charImage.setAttribute('height', '1');
                charImage.setAttribute('width', '1');
                charImage.setAttribute('rotation', '0 0 0');
                charImage.setAttribute('visible', 'false');
                
                entity.appendChild(charImage);

                // 3.5. (重要) 在建立實體時，就直接綁定事件
                entity.addEventListener('targetFound', event => {
                    characterImage.setAttribute('visible', 'true');
                    
                    if (!collectionState[index]) {
                        console.log(`收集到角色 #${index + 1}`);
                        collectionState[index] = true;
                        collectedCount++;

                        document.getElementById(`thumb-${index}`).style.opacity = '1';
                        
                        saveProgress();
                        checkIfComplete();
                    }
                });

                entity.addEventListener('targetLost', event => {
                    characterImage.setAttribute('visible', 'false');
                });

                // 3.6. 將 AR 實體加入場景
                sceneEl.appendChild(entity);
            });

            // 4. (後) *在所有實體都加入場景後*，才設定 <a-scene> 的 mindar-image 屬性
            //    這會觸發 MindAR 開始載入 .mind 檔案並編譯所有已存在的 target
            sceneEl.setAttribute('mindar-image', `
                imageTargetSrc: ${config.mindFile};
                maxTrack: ${config.maxTrack};
            `);
            
            // --- (順序修正結束) ---

            // 5. 綁定重置按鈕事件並顯示它
            resetButton.style.display = 'block';
            resetButton.addEventListener('click', resetProgress);

            // 6. 檢查是否一載入時就已經是完成狀態
            checkIfComplete(true); 

        } catch (error) {
            console.error('AR 應用程式初始化失敗:', error);
            const errorDiv = document.createElement('div');
            errorDiv.style = "position: fixed; top: 10px; left: 10px; padding: 10px; background: red; color: white; z-index: 1000;";
            errorDiv.innerText = 'AR 載入失敗，請檢查版本設定。';
            document.body.appendChild(errorDiv);
        }
    }

    
    // --- 6. AR 事件與遊戲邏輯 ---

    /**
     * 檢查是否收集完成
     */
    function checkIfComplete(isInitialLoad = false) {
        if (collectedCount === totalCharacters) {
            if (!isInitialLoad) {
                console.log('恭喜！已收集所有角色！');
            }
            showCompletionCode(); 
        }
    }

    /**
     * 輔助函數