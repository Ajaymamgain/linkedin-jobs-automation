# LinkedIn Jobs Automation

A robust LinkedIn job scraper using AWS Lambda, Puppeteer, and Next.js with PostgreSQL integration. This solution automatically scrapes job listings from LinkedIn on a scheduled basis (every 1 or 12 hours) and stores them in a PostgreSQL database.

## Features

- AWS Lambda-based scraping
- Puppeteer for reliable web scraping
- PostgreSQL database with Prisma ORM
- Next.js frontend for job display
- Automated scheduling via EventBridge
- Rate limiting and retry mechanisms
- Error handling and monitoring

## Setup Instructions

### Prerequisites

- Node.js 18.x or higher
- AWS Account
- PostgreSQL database
- Next.js development environment

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Ajaymamgain/linkedin-jobs-automation.git
cd linkedin-jobs-automation
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configurations
```

4. Deploy Lambda function:
```bash
npm run deploy:lambda
```

5. Run database migrations:
```bash
npx prisma migrate dev
```

6. Start the Next.js application:
```bash
npm run dev
```

## Configuration

### Lambda Configuration

The Lambda function is configured to run every hour or 12 hours based on your preference. Update the schedule in `serverless.yml`:

```yaml
functions:
  scraper:
    handler: src/lambda/handler.handler
    events:
      - schedule: rate(1 hour)
```

### Scraping Parameters

Configure scraping parameters in `src/config/scraper.ts`:

```typescript
export const scraperConfig = {
  maxJobsPerRun: 100,
  searchQueries: ['software engineer', 'full stack developer'],
  locations: ['United States', 'Remote'],
  maxRetries: 3,
  baseDelay: 1000,
};
```

## Monitoring

Monitor the scraper's performance using AWS CloudWatch. Key metrics include:

- Successful job scrapes
- Failed attempts
- Database update status
- Lambda execution time

## License

MIT License