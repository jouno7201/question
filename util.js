const { default: axios } = require("axios");
require("dotenv").config();

const calculateAge = (birthdate) => {
  const birthYear = new Date(birthdate).getFullYear();
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;

  // 나이대를 계산
  if (age >= 10 && age < 20) {
    return 10;
  } else if (age >= 20 && age < 30) {
    return 20;
  } else if (age >= 30 && age < 40) {
    return 30;
  } else if (age >= 40 && age < 50) {
    return 40;
  } else if (age >= 50) {
    return 50;
  }
  return null;
};

const generateQuestion = async (keyword, difficulty) => {
  const prompt = `"${keyword}"에 대한 ${difficulty} 난이도의 퀴즈 문제를 생성해 주세요. 4개의 선택지를 제공하고, 정답을 표시해 주세요. 결과는 다음 JSON 형식으로 반환해 주세요: {"difficulty":"${difficulty}","question":"문제 텍스트","options":["옵션1","옵션2","옵션3","옵션4"],"answer":"정답","subject":"${keyword}"}`;

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions", // 최신 모델의 엔드포인트 사용
      {
        model: "gpt-3.5-turbo", // 최신 모델 사용
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that generates quiz questions.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 150,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPEN_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // 결과를 파싱하여 문제, 선택지, 정답을 반환
    const result = response.data.choices[0].message.content.trim();

    return parseQuestion(result);
  } catch (err) {
    if (err.response) {
      // 서버가 응답을 반환한 경우 (4xx, 5xx)
      console.error(
        "OpenAI API 응답 오류:",
        err.response.status,
        err.response.data
      );
    } else if (err.request) {
      // 요청이 서버에 도달하지 못한 경우
      console.error("OpenAI API 요청 오류:", err.request);
    } else {
      // 요청을 설정하는 중에 오류가 발생한 경우
      console.error("OpenAI API 설정 오류:", err.message);
    }
    throw new Error("Failed to generate question");
  }
};

// 문제 텍스트 파싱 함수 (예제이며 필요에 따라 수정 가능)
const parseQuestion = (text) => {
  try {
    // JSON 형식의 문자열을 객체로 파싱
    const parsedData = JSON.parse(text);

    // JSON 객체의 필드 추출
    const { question, options, answer, difficulty, subject } = parsedData;

    // 파싱된 데이터를 반환
    return {
      question, // 질문
      options, // 선택지 배열
      answer, // 정답
      difficulty, // 난이도
      subject, // 주제
    };
  } catch (error) {
    console.error("JSON 파싱 오류:", error);
    throw new Error("Failed to parse JSON response");
  }
};

module.exports = {
  calculateAge,
  generateQuestion,
  parseQuestion,
};
