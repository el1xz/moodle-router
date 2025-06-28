```
// ==UserScript==
// @name         Moodle Test Helper (Gemini via OpenRouter)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Adds a button to ALL Moodle quiz questions (multichoice, multianswer, match, shortanswer, and others) to get an answer from Gemini.
// @author       Your Name
// @match        https://lms.kgeu.ru/mod/quiz/attempt.php*
// @match        https://lms.kgeu.ru/mod/quiz/processattempt.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=moodle.org
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      openrouter.ai
// ==/UserScript==

(function() {
    'use strict';

    const API_KEY_STORAGE = 'YOUR_OPENROUTER_API_KEY';

    function getApiKey() {
        let apiKey = GM_getValue(API_KEY_STORAGE);
        if (!apiKey) {
            apiKey = prompt('Пожалуйста, введите ваш API ключ от OpenRouter.ai:');
            if (apiKey) {
                GM_setValue(API_KEY_STORAGE, apiKey);
            }
        }
        return apiKey;
    }

    function askAI(promptText, buttonElement, questionBlock) {
        const apiKey = getApiKey();
        if (!apiKey) {
            alert('API ключ не найден. Скрипт не будет работать.');
            buttonElement.disabled = false;
            buttonElement.textContent = 'ASK Gemini';
            return;
        }

        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://openrouter.ai/api/v1/chat/completions',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                "model": "google/gemini-2.5-flash",
                "messages": [
                    { "role": "user", "content": promptText }
                ]
            }),
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    const rawAnswer = data.choices[0].message.content.trim();
                    const answer = rawAnswer.replace(/^["']|["']$/g, ""); // Убираем кавычки

                    // Показываем визуальный ответ
                    const resultDiv = document.createElement('div');
                    let title = "Ответ от AI:";
                    if (questionBlock.classList.contains('multichoice')) title = "Правильный ответ:";
                    if (questionBlock.classList.contains('multianswer')) title = "Правильные ответы (нужно выбрать):";
                    if (questionBlock.classList.contains('match')) title = "Возможные соответствия:";
                    if (questionBlock.classList.contains('shortanswer')) title = "Предполагаемый ответ:";

                    resultDiv.innerHTML = `<strong>${title}</strong><div style="margin-top: 5px; padding: 8px; border: 2px solid green; background-color: #e6ffed; border-radius: 4px; white-space: pre-wrap;">${answer}</div>`;
                    resultDiv.style.marginTop = '10px';
                    resultDiv.style.fontFamily = 'sans-serif';

                    buttonElement.parentNode.appendChild(resultDiv);
                    buttonElement.textContent = 'Ответ получен!';

                    // Автозаполнение для shortanswer
                    if (questionBlock.classList.contains('shortanswer')) {
                        const inputField = questionBlock.querySelector('input[type="text"]');
                        if (inputField) {
                            inputField.value = answer;
                        }
                    }

                } catch (e) {
                    console.error('Ошибка парсинга ответа:', e, response.responseText);
                    buttonElement.textContent = 'Ошибка!';
                    alert('Не удалось обработать ответ от AI. См. консоль для деталей.');
                }
            },
            onerror: function(error) {
                console.error('Ошибка запроса к OpenRouter:', error);
                buttonElement.disabled = false;
                buttonElement.textContent = 'Ошибка! Попробовать снова';
                alert('Произошла ошибка при обращении к OpenRouter.');
            }
        });
    }

    // --- Основная логика ---
    const questionBlocks = document.querySelectorAll('.que');

    questionBlocks.forEach(block => {
        const infoDiv = block.querySelector('.info');
        if (!infoDiv) return;

        let promptGenerator = null;
        const qtextElement = block.querySelector('.qtext');
        if (!qtextElement) return; // Пропускаем, если у вопроса нет текста
        const questionText = qtextElement.innerText.trim();

        // --- Тип 1: Выбор одного ответа (radio button) ---
        if (block.classList.contains('multichoice')) {
            promptGenerator = () => {
                const answers = Array.from(block.querySelectorAll('.answer .r0, .answer .r1')).map(label => label.innerText.trim().substring(1).trim());
                return `Реши следующий тестовый вопрос. В ответе напиши ТОЛЬКО текст правильного варианта ответа. Без лишних слов.\n\nВопрос:\n"${questionText}"\n\nВарианты:\n${answers.map(a => `- ${a}`).join('\n')}`;
            };
        }
        // --- Тип 2: Выбор нескольких ответов (checkbox) ---
        else if (block.classList.contains('multianswer')) {
            promptGenerator = () => {
                const answers = Array.from(block.querySelectorAll('.answer .r0, .answer .r1')).map(el => el.querySelector('label').innerText.trim());
                return `Найди ВСЕ правильные варианты ответа на следующий вопрос. В ответе перечисли их списком, каждый с новой строки. Не пиши ничего лишнего.\n\nВопрос:\n"${questionText}"\n\nВарианты:\n${answers.map(a => `- ${a}`).join('\n')}`;
            };
        }
        // --- Тип 3: На сопоставление (match) ---
        else if (block.classList.contains('match')) {
            promptGenerator = () => {
                const termsToMatch = Array.from(block.querySelectorAll('table.answer tr .text')).map(td => td.innerText.trim());
                const options = Array.from(block.querySelectorAll('table.answer tr:first-child select option')).filter(opt => opt.value !== "0").map(opt => opt.innerText.trim());
                return `Установи соответствие. В ответе приведи список пар "Термин -> Соответствующий вариант". Каждый ответ с новой строки. Не пиши ничего лишнего.\n\nЗадание: "${questionText}"\n\nТермины:\n${termsToMatch.map(t => `- ${t}`).join('\n')}\n\nВарианты:\n${options.map(o => `- ${o}`).join('\n')}`;
            };
        }
        // --- Тип 4: Короткий ответ (shortanswer) ---
        else if (block.classList.contains('shortanswer')) {
            promptGenerator = () => {
                return `Дай краткий ответ на вопрос (обычно это одно или два слова). В ответе напиши только сам термин, без лишних слов, кавычек и объяснений.\n\nВопрос:\n"${questionText}"`;
            };
        }
        // --- УНИВЕРСАЛЬНЫЙ ОБРАБОТЧИК для всех остальных типов ---
        else {
            promptGenerator = () => {
                const content = block.querySelector('.content');
                const fullQuestionText = content ? content.innerText.trim() : questionText;
                return `Реши следующее тестовое задание. Дай максимально точный и полный ответ, основываясь на предоставленном тексте.\n\nЗадание:\n---\n${fullQuestionText}\n---`;
            };
        }


        // Создаем и добавляем кнопку
        if (promptGenerator) {
            const askButton = document.createElement('button');
            askButton.textContent = 'ASK Gemini';
            askButton.type = 'button';
            askButton.style.cssText = 'margin-top: 10px; padding: 5px 10px; cursor: pointer; border: 1px solid #007bff; background-color: #007bff; color: white; border-radius: 5px;';

            askButton.addEventListener('click', (e) => {
                e.preventDefault();
                askButton.disabled = true;
                askButton.textContent = 'Думаю...';

                // Удаляем предыдущий результат, если он есть
                const oldResult = infoDiv.querySelector('div[style*="border: 2px solid green"]');
                if (oldResult) oldResult.parentElement.remove();

                const prompt = promptGenerator();
                askAI(prompt, askButton, block);
            });

            infoDiv.appendChild(askButton);
        }
    });

})();
```
