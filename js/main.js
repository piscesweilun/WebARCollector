// 使用 DOMContentLoaded 事件確保在操作 DOM 元素前，HTML 已完全載入並解析
document.addEventListener('DOMContentLoaded', () => {
    const sceneEl = document.querySelector('#ar-scene');
    const qrcodeContainer = document.getElementById('qrcode-container');
    
    // 遊戲狀態
    const collectionState = Array(8).fill(false);
    const totalCharacters = 8;
    let collectedCount = 0;

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

    function checkIfComplete() {
        if (collectedCount === totalCharacters) {
            console.log('恭喜！已收集所有角色！');
            generateAndShowQRCode();
        }
    }

    // 生成並顯示 QR Code
    function generateAndShowQRCode() {
        // --- 這裡做了修改 ---
        const now = new Date();
        const timestamp = now.toISOString(); // 產生 ISO 8601 格式的時間戳, 例如: "2025-10-18T15:05:12.345Z"
        const uniqueId = Math.floor(100000 + Math.random() * 900000).toString(); // 6位數隨機碼

        const jsonData = {
            timestamp: timestamp, // 新的 key
            uniqueId: uniqueId,     // 新的 key
        };
        const jsonString = JSON.stringify(jsonData);
        // --- 修改結束 ---

        qrcodeContainer.innerHTML = '';
        new QRCode(qrcodeContainer, {
            text: jsonString,
            width: 100,
            height: 100,
        });

        qrcodeContainer.style.display = 'block';
    }
});