/**
 * AR 圖卡收集遊戲 (v3.20 - 加入地圖 POI 面板邏輯)
 * * 功能：
 * 1. 動態版本載入
 * 2. 進度儲存 (LocalStorage)
 * 3. (新) 地圖 POI 按鈕及資訊面板
 * 4. (新) 使用 'AFRAME.registerComponent' 來保證 'tick' 被呼叫
 * 5. (新) 邏輯修正：無論是否已收集，不在範圍內時一律隱藏模型
 */

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. DOM 元素快取 ---
    const sceneEl = document.querySelector('#ar-scene');
    const assetsEl = document.querySelector('a-assets');
    const thumbnailsContainer = document.getElementById('thumbnails-container');
    const qrcodeContainer = document.getElementById('qrcode-container');
    const resetButton = document.getElementById('reset-button');
    const completionCodeContainer = document.getElementById('completion-code-container');
    const cameraButton = document.getElementById('camera-button');
    const cameraSound = document.getElementById('camera-sound');

    // (!!! 新增地圖相關元素 !!!)
    const mapButton = document.getElementById('map-button');
    const mapOverlay = document.getElementById('map-overlay');
    const mapBackButton = document.getElementById('map-back-button');
    const mapPoiButtons = document.querySelectorAll('.map-poi');
    const infoPanelOverlay = document.getElementById('info-panel-overlay');
    const infoPanelImage = document.getElementById('info-panel-image');
    const infoPanelClose = document.getElementById('info-panel-close');


    // --- 2. 遊戲狀態變數 ---
    let collectionState = [];
    let totalCharacters = 0;
    let collectedCount = 0;
    let currentVisibleTargetEntity = null;
    let activeTargetIndex = null;
    let targetLostTimer = null;
    let CURRENT_VERSION = '';
    let CONFIG_PATH = '';
    let SAVE_KEY = '';
    
    // (!!!) 用於 3D 計算的可重複使用變數
    const worldPosition = new THREE.Vector3();

    
    // --- 3. (!!! 關鍵 !!!) ---
    // 我們註冊 A-Frame 元件
    AFRAME.registerComponent('distance-checker', {
        tick: function () {
            // 這個 'tick' 會呼叫我們的主偵測函數
            checkTargetDistance();
        }
    });
    // --- 修正結束 ---


    // --- 4. 啟動器 ---
    initApp();


    /**
     * 從 URL 參數獲取版本號
     */
    function getVersionFromURL() {
        // ... (函數內容保持不變)
        const urlParams = new URLSearchParams(window.location.search);
        const version = urlParams.get('version');
        return version || 'v1';
    }

    /**
     * 載入進度
     */
    function loadProgress(characterCount) {
        // ... (函數內容保持不變)
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
        // ... (函數內容保持不變)
        localStorage.setItem(SAVE_KEY, JSON.stringify(collectionState));
        console.log('進度已儲存。');
    }
    /**
     * 重置進度
     */
    function resetProgress() {
        // ... (函數內容保持不變)
        if (confirm('您確定要清除所有收集進度並重新開始嗎？')) {
            localStorage.removeItem(SAVE_KEY);
            alert('進度已清除，頁面將重新載入。');
            window.location.reload();
        }
    }


    /**
     * 異步初始化 App
     */
    async function initApp() {
        
        // --- 設定全域變數 ---
        CURRENT_VERSION = getVersionFromURL();
        CONFIG_PATH = `versions/${CURRENT_VERSION}/config.json`;
        SAVE_KEY = `arCollectionSave_${CURRENT_VERSION}`;

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
            
            // 3. (!!! 邏輯修改 !!!) 動態生成元素並綁定 *新* 事件
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

                // 3.2. (!!! 已修正 !!!) 建立 <a-assets> 內的 <img>
                const assetId = `char-asset-${index}`;
                const assetImg = document.createElement('img');
                assetImg.id = assetId;
                assetImg.src = char.char;
                assetsEl.appendChild(assetImg);

                // 3.3. 建立 <a-entity> (AR 目標)
                const entity = document.createElement('a-entity');
                entity.setAttribute('mindar-image-target', `targetIndex: ${index}`);
                
                // 3.4. (!!! 已修正 !!!) 建立 <a-image> (顯示的角色圖片)
                const charImage = document.createElement('a-image');
                charImage.className = 'character-image';
                charImage.setAttribute('src', `#${assetId}`);
                charImage.setAttribute('position', '0 0 0');
                charImage.setAttribute('height', '1');
                charImage.setAttribute('width', '1');
                charImage.setAttribute('rotation', '0 0 0');
                charImage.setAttribute('visible', 'false');
                
                entity.appendChild(charImage);

                // 3.5. (!!! 新 !!!) 將 A-Frame 實體、索引和圖片元素互相綁定
                entity.charImageElement = charImage;
                entity.targetIndex = index;

                // 3.6. (!!! 修正 !!!) 加入閃爍緩衝 (並恢復 log)
                entity.addEventListener('targetFound', event => {
                    console.log(`事件: targetFound (偵測到目標 #${entity.targetIndex})`);
                    
                    if (targetLostTimer) {
                        clearTimeout(targetLostTimer);
                        targetLostTimer = null;
                    }
                    
                    currentVisibleTargetEntity = entity;
                });

                entity.addEventListener('targetLost', event => {
                    console.log(`事件: targetLost (目標 #${entity.targetIndex} 消失)`);
                    
                    if (currentVisibleTargetEntity === entity) {
                        if (targetLostTimer) clearTimeout(targetLostTimer);
                        targetLostTimer = setTimeout(() => {
                            currentVisibleTargetEntity = null;
                            activeTargetIndex = null;
                            cameraButton.style.display = 'none';
                            entity.charImageElement.setAttribute('visible', 'false');
                            targetLostTimer = null;
                        }, 100); 
                    }
                });

                // 3.7. 將 AR 實體加入場景
                sceneEl.appendChild(entity);
            });

            // 4. (!!!) 綁定偵測與點擊事件
            cameraButton.addEventListener('click', onCameraButtonClick); // 綁定按鈕點擊
            
            // (!!! 新增地圖事件綁定 !!!)
            mapButton.addEventListener('click', toggleMap);
            mapBackButton.addEventListener('click', toggleMap);
            infoPanelClose.addEventListener('click', hideInfoPanel);
            mapPoiButtons.forEach(button => {
                button.addEventListener('click', onMapPoiClick);
            });
            
            // 5. *在所有實體都加入場景後*，才設定 <a-scene> 的 mindar-image 屬性
            sceneEl.setAttribute('mindar-image', `
                imageTargetSrc: ${config.mindFile};
                maxTrack: ${config.maxTrack};
            `);
            
            // 6. 綁定重置按鈕事件並顯示它
            resetButton.style.display = 'block';
            resetButton.addEventListener('click', resetProgress);

            // 7. 檢查是否一載入時就已經是完成狀態
            checkIfComplete(true);

        } catch (error) {
            console.error('initApp 執行失敗，跳入 CATCH 區塊', error);
            const errorDiv = document.createElement('div');
            errorDiv.style = "position: fixed; top: 10px; left: 10px; padding: 10px; background: red; color: white; z-index: 1000;";
            errorDiv.innerText = 'AR 載入失敗，請檢查版本設定。';
            document.body.appendChild(errorDiv);
        }
    }


    /**
     * (新) 每幀執行 (Tick)，用於偵測距離
     */
    function checkTargetDistance() {
        
        // (!!! 恢復 v3.10 邏輯 !!!)
        // 檢查 'currentVisibleTargetEntity' 是否存在
        if (!currentVisibleTargetEntity) {
            // 沒有可見目標，結束
            return;
        }

        // --- 只有在 currentVisibleTargetEntity 存在時，才會執行到這裡 ---
        
        // 1. 獲取資訊
        const targetIndex = currentVisibleTargetEntity.targetIndex;
        const charImage = currentVisibleTargetEntity.charImageElement;
        
        // 2. (!!! 恢復 v3.10 邏輯 !!!) 
        // 獲取 *目標* 的世界位置
        currentVisibleTargetEntity.object3D.getWorldPosition(worldPosition);
        
        // (!!! 恢復 v3.10 邏輯 !!!) 
        // 計算目標的距離 (這會是 8660 之類的大數字)
        const distance = worldPosition.length();

        // 3. 輸出距離 (!!!)
        //console.log(`距離偵測: 目標 #${targetIndex}, 距離 (Scene Units): ${distance.toFixed(3)}`);

        
        // 4. (!!! 關鍵邏輯修正 !!!)
        // 檢查距離是否在範圍內
        // (我們仍然使用 8660 適用的大範圍)
        if (distance >= 3000 && distance <= 6000) {
            // A. 在範圍內：一律顯示模型
            charImage.setAttribute('visible', 'true');

            // B. 檢查是否 *尚未* 收集
            if (!collectionState[targetIndex]) {
                // 未收集：顯示按鈕
                cameraButton.style.display = 'block';
                activeTargetIndex = targetIndex; // 設為「可收集」狀態
            } else {
                // 已收集：隱藏按鈕
                cameraButton.style.display = 'none';
                activeTargetIndex = null;
            }
        } else {
            // C. 不在範圍內：一律隱藏 (無論是否收集過)
            charImage.setAttribute('visible', 'false');
            cameraButton.style.display = 'none';
            activeTargetIndex = null; // 取消「可收集」狀態
        }
    }

    /**
     * (新) 點擊相機按鈕時觸發
     */
    function onCameraButtonClick() {
        if (activeTargetIndex === null || collectionState[activeTargetIndex]) {
            return;
        }

        // --- 執行收集 ---
        const indexToCollect = activeTargetIndex;
        
        console.log(`收集到角色 #${indexToCollect + 1}`);
        collectionState[indexToCollect] = true;
        collectedCount++;

        // 更新縮圖
        document.getElementById(`thumb-${indexToCollect}`).style.opacity = '1';
        
        // 儲存進度
        saveProgress();
        checkIfComplete();
        
        // (新) 播放音效
        if (cameraSound) {
            cameraSound.currentTime = 0; // 重置音效
            cameraSound.play();
        }

        // 隱藏按鈕 (因為已收集)
        cameraButton.style.display = 'none';
        activeTargetIndex = null; // 清除可收集狀態
    }

    /**
     * (!!! 新增 !!!) 切換地圖顯示
     */
    function toggleMap() {
        if (mapOverlay.classList.contains('hidden')) {
            mapOverlay.classList.remove('hidden');
        } else {
            mapOverlay.classList.add('hidden');
            // 關閉地圖時，也要確保關閉資訊面板
            hideInfoPanel();
        }
    }

    /**
     * (!!! 新增 !!!) 點擊 POI 按鈕
     */
    function onMapPoiClick(event) {
        // 從按鈕的 'data-index' 屬性獲取索引 (1-8)
        const index = event.currentTarget.dataset.index;
        if (!index) return;
        
        console.log(`顯示地圖資訊 #${index}`);
        showInfoPanel(index);
    }

    /**
     * (!!! 新增 !!!) 顯示資訊面板
     */
    function showInfoPanel(index) {
        // 設定對應的圖片
        infoPanelImage.setAttribute('src', `assets/ui/MapInfo_${index}.png`);
        // 顯示面板
        infoPanelOverlay.classList.remove('hidden');
    }

    /**
     * (!!! 新增 !!!) 隱藏資訊面板
     */
    function hideInfoPanel() {
        infoPanelOverlay.classList.add('hidden');
        // (可選) 隱藏時清除圖片 src，節省記憶體
        infoPanelImage.setAttribute('src', '');
    }


    /**
     * 檢查是否收集完成
     */
    function checkIfComplete(isInitialLoad = false) {
        // ... (函數內容保持不變)
        if (collectedCount === totalCharacters) {
            if (!isInitialLoad) {
                console.log('恭喜！已收集所有角色！');
            }
            showCompletionCode();
        }
    }

    /**
     * 輔助函數：將數字補零
     */
    function pad(num, length = 2) {
        return String(num).padStart(length, '0');
    }

    /**
     * 顯示收集完成後的日期時間代碼
     */
    function showCompletionCode() {
        // ... (函數內容保持不變)
        const now = new Date();
        const Y = now.getFullYear();      
        const M = pad(now.getMonth() + 1); 
        const D = pad(now.getDate());     
        const h = pad(now.getHours());    
        const m = pad(now.getMinutes());  
        const s = pad(now.getSeconds());  

        const codeString = `${Y}${M}${D}${h}${m}${s}`;
        
        completionCodeContainer.innerText = codeString;
        completionCodeContainer.style.display = 'block';
    }
}); // (!!! 結束 DOMContentLoaded !!!)