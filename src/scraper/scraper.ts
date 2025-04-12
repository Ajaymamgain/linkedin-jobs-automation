import { Page } from 'puppeteer-core';
import { sleep } from '../utils/helpers';

interface JobListing {
    id: string;
    title: string;
    company: string;
    location: string;
    description: string;
    salary?: string;
    jobType?: string;
    postedDate: string;
    url: string;
}

export class LinkedInScraper {
    private page: Page;
    private maxRetries: number;
    private baseDelay: number;
    private currentQuery: string = '';

    constructor(page: Page, maxRetries = 3, baseDelay = 1000) {
        this.page = page;
        this.maxRetries = maxRetries;
        this.baseDelay = baseDelay;
    }

    async scrapeJobListings(searchQuery: string, maxJobs = 100): Promise<JobListing[]> {
        const jobs: JobListing[] = [];
        let currentPage = 1;
        this.currentQuery = searchQuery;
        
        try {
            // Add random delay before starting
            await sleep(Math.random() * 2000 + 1000);
            
            const searchUrl = this.buildSearchUrl(searchQuery, currentPage);
            await this.page.goto(searchUrl, { 
                waitUntil: 'networkidle0',
                timeout: 30000 
            });

            while (jobs.length < maxJobs) {
                // Random delay between pages
                await sleep(Math.random() * 3000 + 2000);

                // Wait for job cards with retry mechanism
                const jobCards = await this.waitForJobCards();
                if (!jobCards.length) break;

                for (const card of jobCards) {
                    if (jobs.length >= maxJobs) break;

                    // Random delay between job processing
                    await sleep(Math.random() * 1500 + 500);

                    const job = await this.extractJobData(card);
                    if (job) {
                        jobs.push(job);
                        console.log(`Scraped job: ${job.title} at ${job.company}`);
                    }
                }

                if (jobs.length >= maxJobs || !(await this.hasNextPage())) {
                    break;
                }

                // Go to next page with retry mechanism
                currentPage++;
                await this.goToNextPage(currentPage);
                
                // Longer delay between pages
                await sleep(Math.random() * 5000 + 3000);
            }

        } catch (error) {
            console.error('Error during job scraping:', error);
            throw error;
        }

        return jobs;
    }

    private async waitForJobCards(maxAttempts = 3): Promise<any[]> {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                await this.page.waitForSelector('.job-card-container', { timeout: 10000 });
                return await this.page.$$('.job-card-container');
            } catch (error) {
                if (attempt === maxAttempts - 1) throw error;
                await sleep(this.baseDelay * Math.pow(2, attempt));
            }
        }
        return [];
    }

    private async extractJobData(jobCard: any): Promise<JobListing | null> {
        try {
            // Click the job card and wait for details to load
            await this.retryOperation(async () => {
                await jobCard.click();
                await this.page.waitForSelector('.job-view-layout', { timeout: 5000 });
            });

            // Extract job details using page.evaluate
            const jobData = await this.page.evaluate(() => {
                const getTextContent = (selector: string) => {
                    const element = document.querySelector(selector);
                    return element ? element.textContent?.trim() : '';
                };

                // More reliable selectors that are less likely to change
                const title = getTextContent('h1.job-details-jobs-unified-top-card__job-title') || 
                             getTextContent('.job-details-jobs-unified-top-card__job-title');
                             
                const company = getTextContent('.job-details-jobs-unified-top-card__company-name') ||
                               getTextContent('a[data-tracking-control-name="public_jobs_unified-top-card-job-company-name"]');
                               
                const location = getTextContent('.job-details-jobs-unified-top-card__bullet') ||
                                getTextContent('[data-tracking-control-name="public_jobs_unified-top-card-job-location"]');
                                
                const description = getTextContent('.job-view-layout [data-tracking-control-name="public_jobs_unified-top-card-job-details"]') ||
                                  getTextContent('.job-details-jobs-unified-top-card__description-container');

                // Extract additional details
                const jobType = getTextContent('.job-details-jobs-unified-top-card__job-type');
                const salary = getTextContent('.job-details-jobs-unified-top-card__salary-range');
                const postedDate = getTextContent('.job-details-jobs-unified-top-card__posted-date');
                
                // Get the job ID from various possible sources
                const jobIdElement = document.querySelector('[data-job-id]') || 
                                   document.querySelector('.job-view-layout');
                const jobId = jobIdElement?.getAttribute('data-job-id') || 
                             window.location.pathname.split('/').pop() || 
                             '';

                return {
                    id: jobId,
                    title,
                    company,
                    location,
                    description,
                    jobType,
                    salary,
                    postedDate,
                    url: window.location.href
                };
            });

            // Validate required fields
            if (!jobData.id || !jobData.title || !jobData.company) {
                console.warn('Missing required job data fields');
                return null;
            }

            return jobData as JobListing;

        } catch (error) {
            console.warn('Failed to extract job data:', error);
            return null;
        }
    }

    private async retryOperation(operation: () => Promise<void>, maxAttempts = 3) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                await operation();
                return;
            } catch (error) {
                if (attempt === maxAttempts - 1) throw error;
                await sleep(this.baseDelay * Math.pow(2, attempt));
            }
        }
    }

    private buildSearchUrl(query: string, page: number): string {
        const encodedQuery = encodeURIComponent(query);
        const startPosition = (page - 1) * 25;
        return `https://www.linkedin.com/jobs/search/?keywords=${encodedQuery}&start=${startPosition}&position=1&pageNum=${page}`;
    }

    private async hasNextPage(): Promise<boolean> {
        try {
            return await this.page.evaluate(() => {
                const nextButton = document.querySelector('button.next') as HTMLButtonElement;
                return nextButton !== null && !nextButton.hasAttribute('disabled');
            });
        } catch (error) {
            console.warn('Error checking for next page:', error);
            return false;
        }
    }

    private async goToNextPage(page: number): Promise<void> {
        await this.retryOperation(async () => {
            const nextUrl = this.buildSearchUrl(this.currentQuery, page);
            await this.page.goto(nextUrl, { waitUntil: 'networkidle0', timeout: 30000 });
            await this.page.waitForSelector('.job-card-container', { timeout: 10000 });
        });
    }
}