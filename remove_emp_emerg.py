import re

path = r'e:\ayu\frontend\src\pages\EmployeesPage.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r'\s*emergency:\s*"Emergency / Casualty",', '', content)
content = content.replace('"emergency", ', '')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
