import csv

# 입력 텍스트 파일 경로
input_txt_file = '퀴즈 나이.txt'
# 출력 CSV 파일 경로
output_csv_file = '퀴즈 나이.csv'

# 텍스트 파일 읽기
with open(input_txt_file, 'r', encoding='utf-8') as txt_file:
    lines = txt_file.readlines()

# CSV 파일 쓰기
with open(output_csv_file, 'w', newline='', encoding='utf-8') as csv_file:
    writer = csv.writer(csv_file)
    writer.writerow(['keyword', 'ages'])  # CSV 헤더 추가

    for line in lines:
        print(line.split('.')[1].strip())
        # 텍스트 파일의 각 줄에서 keyword와 ages 분리
        keyword, ages = line.split('.')[1].strip().split(' ')
        writer.writerow([keyword, ages])

print(f"Data successfully written to {output_csv_file}")
