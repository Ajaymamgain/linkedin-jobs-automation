import { DynamoDB } from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const dynamodb = new DynamoDB.DocumentClient();
const JOBS_TABLE = process.env.JOBS_TABLE!;

// Helper function to format response
const formatResponse = (statusCode: number, body: any) => ({
    statusCode,
    headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body)
});

export const getJobs = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const { lastEvaluatedKey, limit = '50' } = event.queryStringParameters || {};
        
        const params: DynamoDB.DocumentClient.ScanInput = {
            TableName: JOBS_TABLE,
            Limit: parseInt(limit),
            FilterExpression: 'attribute_exists(id)',
        };

        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = JSON.parse(lastEvaluatedKey);
        }

        const result = await dynamodb.scan(params).promise();

        return formatResponse(200, {
            jobs: result.Items,
            lastEvaluatedKey: result.LastEvaluatedKey
        });

    } catch (error) {
        console.error('Error getting jobs:', error);
        return formatResponse(500, { error: 'Could not retrieve jobs' });
    }
};

export const searchJobs = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const { company, location, title, postedDate } = JSON.parse(event.body || '{}');
        
        let filterExpression = '';
        let expressionAttributeValues: any = {};
        let expressionAttributeNames: any = {};

        // Build filter expression dynamically
        if (company) {
            filterExpression += filterExpression ? ' AND ' : '';
            filterExpression += 'contains(#company, :company)';
            expressionAttributeValues[':company'] = company;
            expressionAttributeNames['#company'] = 'company';
        }

        if (location) {
            filterExpression += filterExpression ? ' AND ' : '';
            filterExpression += 'contains(#location, :location)';
            expressionAttributeValues[':location'] = location;
            expressionAttributeNames['#location'] = 'location';
        }

        if (title) {
            filterExpression += filterExpression ? ' AND ' : '';
            filterExpression += 'contains(#title, :title)';
            expressionAttributeValues[':title'] = title;
            expressionAttributeNames['#title'] = 'title';
        }

        if (postedDate) {
            filterExpression += filterExpression ? ' AND ' : '';
            filterExpression += '#postedDate = :postedDate';
            expressionAttributeValues[':postedDate'] = postedDate;
            expressionAttributeNames['#postedDate'] = 'postedDate';
        }

        const params: DynamoDB.DocumentClient.QueryInput = {
            TableName: JOBS_TABLE,
            IndexName: 'CompanyIndex',
            KeyConditionExpression: company ? '#company = :company' : undefined,
            FilterExpression: filterExpression || undefined,
            ExpressionAttributeValues: Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
            ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined
        };

        let result;
        if (company) {
            result = await dynamodb.query(params).promise();
        } else {
            result = await dynamodb.scan({
                TableName: JOBS_TABLE,
                FilterExpression: filterExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                ExpressionAttributeNames: expressionAttributeNames
            }).promise();
        }

        return formatResponse(200, {
            jobs: result.Items,
            count: result.Count,
            scannedCount: result.ScannedCount
        });

    } catch (error) {
        console.error('Error searching jobs:', error);
        return formatResponse(500, { error: 'Could not search jobs' });
    }
};

export const getJobsByCompany = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const { company } = event.pathParameters || {};
        
        if (!company) {
            return formatResponse(400, { error: 'Company parameter is required' });
        }

        const params: DynamoDB.DocumentClient.QueryInput = {
            TableName: JOBS_TABLE,
            IndexName: 'CompanyIndex',
            KeyConditionExpression: '#company = :company',
            ExpressionAttributeNames: {
                '#company': 'company'
            },
            ExpressionAttributeValues: {
                ':company': company
            }
        };

        const result = await dynamodb.query(params).promise();

        return formatResponse(200, {
            jobs: result.Items,
            count: result.Count
        });

    } catch (error) {
        console.error('Error getting jobs by company:', error);
        return formatResponse(500, { error: 'Could not retrieve jobs' });
    }
};