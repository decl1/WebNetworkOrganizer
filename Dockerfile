FROM python:3.12-alpine

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY public ./public
RUN mkdir -p /app/data

EXPOSE 8991

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8991"]