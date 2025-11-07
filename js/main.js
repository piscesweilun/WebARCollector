// 使用 DOMContentLoaded 事件確保在操作 DOM 元素前，HTML 已完全載入並解析
document.addEventListener('DOMContentLoaded', () => {
    
    /**
     * (新增) 從 URL 參數獲取版本號
     * 例如：index.html?version=v2
     * @returns {string} 版本號，如果未指定，則預設為 'v1'
     */
    function getVersionFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const version = urlParams.get('version');
        return version || 'v1'; // 如果 URL 中沒有 'version' 參數，則預設為 'v1'
    }

    // --- 這裡做了修改 ---
    // 根據 URL 參數動態設定要載入的版本
    const CURRENT_VERSION = getVersionFromURL();
    const CONFIG_PATH = `versions/${CURRENT_VERSION}/config.json`;

    // 遊戲狀態 (將由 config 動態設定)
    let collectionState = [];
    let totalCharacters = 0;
    let collectedCount = 0;

    // DOM 元素
    const sceneEl = document.querySelector('#ar-scene');
    const assetsEl = document.querySelector('a-assets');
    const thumbnailsContainer = document.getElementById('thumbnails-container');
    const qrcodeContainer = document.getElementById('qrcode-container');

    /**
     * 異步初始化 App
     */
    async function initApp() {
        let config;
        try {
            // 1. 載入設定檔
            const response = await fetch(CONFIG_PATH);
            if (!response.ok) {
                // 如果指定的版本載入失敗（例如 URL 亂填）
                console.error(`無法載入設定檔: ${CONFIG_PATH}`);
                alert(`錯誤：找不到版本 '${CURRENT_VERSION}' 的設定檔。\n將嘗試載入預設版本 'v1'。`);
                
                // (可選) 嘗試退回 (fallback) 到 v1
                const v1_CONFIG_PATH = `versions/v1/config.json`;
                const v1_response = await fetch(v1_CONFIG_PATH);
                if (!v1_response.ok) {
                    throw new Error(`連預設版本 'v1' 都載入失敗。`);
                }
                config = await v1_response.json();
            } else {
                 config = await response.json();
            }

            // 2. 設定遊戲狀態
            totalCharacters = config.characters.length;
            collectionState = Array(totalCharacters).fill(false);

            // 3. 設定 MindAR 屬性
            sceneEl.setAttribute('mindar-image', `
                imageTargetSrc: ${config.mindFile};
                maxTrack: ${config.maxTrack};
            `);

            // 4. 動態生成 HTML 元素 (縮圖、Assets、AR 實體)
            config.characters.forEach((char, index) => {
                
                // 4.1. 建立縮圖
                const thumbImg = document.createElement('img');
                thumbImg.id = `thumb-${index}`;
                thumbImg.className = 'thumbnail';
                thumbImg.src = char.thumb;
                thumbnailsContainer.appendChild(thumbImg);

                // 4.2. 建立 <a-assets> 內的 <img>
                const assetImg = document.createElement('img');
                const assetId = `char-asset-${index}`;
                assetImg.id = assetId;
                assetImg.src = char.char;
                assetsEl.appendChild(assetImg);

                // 4.3. 建立 <a-entity> (AR 目標)
                const entity = document.createElement('a-entity');
                entity.setAttribute('mindar-image-target', `targetIndex: ${index}`);
                
                // 4.4. 建立 <a-image> (顯示的角色圖片)
                const charImage = document.createElement('a-image');
                charImage.className = 'character-image';
                charImage.setAttribute('src', `#${assetId}`);
                charImage.setAttribute('position', '0 0 0');
                charImage.setAttribute('height', '1');
                charImage.setAttribute('width', '1');
                charImage.setAttribute('rotation', '0 0 0');
                charImage.setAttribute('visible', 'false');
                
                entity.appendChild(charImage);
                sceneEl.appendChild(entity);
            });

            // 5. (重要) 在所有元素生成後，才綁定事件監聽
            initializeAREvents();

        } catch (error) {
            console.error('AR 應用程式初始化失敗:', error);
            // 可以在畫面顯示錯誤訊息
            const errorDiv = document.createElement('div');
            errorDiv.style = "position: fixed; top: 10px; left: 10px; padding: 10px; background: red; color: white; z-index: 1000;";
            errorDiv.innerText = 'AR 載入失敗，請檢查版本設定。';
            document.body.appendChild(errorDiv);
        }
    }

    /**
     * 綁定 AR 事件監聽
     * (此函數與前一版相同，無需修改)
     */
    function initializeAREvents() {
        const characterEntities = document.querySelectorAll('[mindar-image-target]');

        characterEntities.forEach((entity, index) => {
            const characterImage = entity.querySelector('.character-image');

            entity.addEventListener('targetFound', event => {
                characterImage.setAttribute('visible', 'true');
                
                if (!collectionState[index]) {
                    console.log(`收集到角色 #${index + 1}`);
                    collectionState[index] = true;
                    collectedCount++;

                    document.getElementById(`thumb-${index}`).style.opacity = '1';
                    checkIfComplete();
                }
            });

            entity.addEventListener('targetLost', event => {
                characterImage.setAttribute('visible', 'false');
            });
        });
    }

    /**
     * 檢查是否收集完成
     * (此函數與前一版相同，無需修改)
     */
    function checkIfComplete() {
        if (collectedCount === totalCharacters) {
            console.log('恭喜！已收集所有角色！');
            generateAndShowQRCode();
        }
    }

    /**
     * 生成並顯示 QR Code
     * (此函數與前一版相同，無需修改)
     */
    function generateAndShowQRCode() {
        const now = new Date();
        const timestamp = now.toISOString();
        const uniqueId = Math.floor(100000 + Math.random() * 900000).toString();

        const jsonData = {
            timestamp: timestamp,
            uniqueId: uniqueId,
        };
        const jsonString = JSON.stringify(jsonData);

        qrcodeContainer.innerHTML = '';
        new QRCode(qrcodeContainer, {
            text: jsonString,
            width: 100,
            height: 100,
        });

        qrcodeContainer.style.display = 'block';
    }

    // --- 啟動應用程式 ---
    initApp();
});