import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';
import { DynamoDB } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { LinkedInScraper } from '../scraper/scraper';
import { scraperConfig } from '../config/scraper';

const dynamodb = new DynamoDB.DocumentClient();
const JOBS_TABLE = process.env.JOBS_TABLE!;
const SCRAPING_LOGS_TABLE = process.env.SCRAPING_LOGS_TABLE!;

export const handler = async (event: any) => {
    let browser = null;
    const scrapingLogId = uuidv4();
    const jobsFound: string[] = [];
    const startTime = new Date().toISOString();
    
    try {
        // Create scraping log entry
        await dynamodb.put({
            TableName: SCRAPING_LOGS_TABLE,
            Item: {
                id: scrapingLogId,
                startTime,
                success: false,
                jobsFound: 0,
                createdAt: Date.now()
            }
        }).promise();

        // Launch browser with anti-detection measures
        browser = await puppeteer.launch({
            args: [
                ...chromium.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-infobars',
                '--window-position=0,0',
                '--ignore-certifcate-errors',
                '--ignore-certifcate-errors-spki-list',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--hide-scrollbars',
                '--disable-notifications',
                '--disable-extensions',
                '--force-device-scale-factor=1',
            ],
            defaultViewport: {
                width: 1920,
                height: 1080
            },
            executablePath: await chromium.executablePath,
            headless: true,
            ignoreHTTPSErrors: true
        });

        const page = await browser.newPage();
        
        // Add stealth measures
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            
            // @ts-ignore
            window.navigator.mediaDevices = {
                getUserMedia: async () => new MediaStream(),
            };
            
            window.navigator.chrome = { runtime: {} };
            
            Object.defineProperty(window.screen, 'width', { get: () => 1920 });
            Object.defineProperty(window.screen, 'height', { get: () => 1080 });
        });

        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        const scraper = new LinkedInScraper(page, scraperConfig.maxRetries, scraperConfig.baseDelay);
        
        // Batch write to DynamoDB
        const batchWriteJobs = async (jobs: any[]) => {
            const chunks = [];
            for (let i = 0; i < jobs.length; i += 25) {
                chunks.push(jobs.slice(i, i + 25));
            }

            for (const chunk of chunks) {
                const putRequests = chunk.map(job => ({
                    PutRequest: {
                        Item: {
                            id: job.id,
                            title: job.title,
                            company: job.company,
                            location: job.location,
                            description: job.description,
                            salary: job.salary || null,
                            jobType: job.jobType || null,
                            postedDate: job.postedDate,
                            url: job.url,
                            createdAt: Date.now(),
                            ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
                        }
                    }
                }));

                await dynamodb.batchWrite({
                    RequestItems: {
                        [JOBS_TABLE]: putRequests
                    }
                }).promise();
            }
        };

        // Scrape jobs for each search query and location
        for (const query of scraperConfig.searchQueries) {
            for (const location of scraperConfig.locations) {
                try {
                    console.log(`Scraping jobs for: ${query} in ${location}`);
                    
                    const jobs = await scraper.scrapeJobListings(
                        `${query} ${location}`,
                        scraperConfig.maxJobsPerRun
                    );
                    
                    // Batch write jobs to DynamoDB
                    await batchWriteJobs(jobs);
                    
                    jobsFound.push(...jobs.map(job => job.id));
                    
                    // Random delay between searches
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 10000 + 5000));
                    
                } catch (error) {
                    console.error(`Error scraping ${query} in ${location}:`, error);
                }
            }
        }

        // Update scraping log with success
        await dynamodb.update({
            TableName: SCRAPING_LOGS_TABLE,
            Key: { id: scrapingLogId },
            UpdateExpression: 'SET endTime = :endTime, success = :success, jobsFound = :jobsFound',
            ExpressionAttributeValues: {
                ':endTime': new Date().toISOString(),
                ':success': true,
                ':jobsFound': jobsFound.length
            }
        }).promise();

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Scraping completed successfully',
                jobsScraped: jobsFound.length
            })
        };

    } catch (error) {
        console.error('Scraping failed:', error);
        
        // Update scraping log with error
        await dynamodb.update({
            TableName: SCRAPING_LOGS_TABLE,
            Key: { id: scrapingLogId },
            UpdateExpression: 'SET endTime = :endTime, success = :success, error = :error, jobsFound = :jobsFound',
            ExpressionAttributeValues: {
                ':endTime': new Date().toISOString(),
                ':success': false,
                ':error': error.message,
                ':jobsFound': jobsFound.length
            }
        }).promise();

        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    } finally {
        if (browser !== null) {
            await browser.close();
        }
    }
};