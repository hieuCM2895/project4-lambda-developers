import * as AWS from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import { createLogger } from '../utils/logger';
import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import { TodoItem, TodoUpdate } from '../models/Todo';

const XAWS = AWSXRay.captureAWS(AWS);
const logger = createLogger('todoAccess');

export class TodoAccess {
  constructor(
    private readonly docClient: DocumentClient = new XAWS.DynamoDB.DocumentClient(),
    private readonly todosTable = process.env.TODOS_TABLE || 'default-todos-table-name',
    private readonly todosIndex = process.env.INDEX_NAME
  ) {}

  async getTodos(userId: string): Promise<TodoItem[]> {
    logger.info('Getting all todo items');
    const result = await this.docClient
      .query({
        TableName: this.todosTable,
        IndexName: this.todosIndex,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      })
      .promise();
    return result.Items as TodoItem[];
  }

  async getTodo(userId: string, 
                todoId: string): Promise<TodoItem> {
    logger.info(`Getting todo item: ${todoId}`);
    const result = await this.docClient
      .query({
        TableName: this.todosTable,
        KeyConditionExpression: 'userId = :userId and todoId = :todoId',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':todoId': todoId
        }
      })
      .promise();
    const todoItem = result.Items[0];
    return todoItem as TodoItem;
  }

  async createTodo(newTodo: TodoItem): Promise<TodoItem> {
    logger.info(`Creating new todo item: ${newTodo.todoId}`);
    const result = await this.docClient
      .put({
        TableName: this.todosTable,
        Item: newTodo
      })
      .promise();
    logger.info('Todo item created: ', result)
    return newTodo;
  }

  async updateTodo(
    userId: string, 
    todoId: string, 
    updateData: TodoUpdate): Promise<TodoUpdate> {
    logger.info(`Updating a todo item: ${todoId}`);
    await this.docClient
      .update({
        TableName: this.todosTable,
        Key: { 
            userId, 
            todoId 
        },
        ConditionExpression: 'attribute_exists(todoId)',
        UpdateExpression: 'set #n = :n, dueDate = :due, done = :dn',
        ExpressionAttributeNames: { '#n': 'name' },
        ExpressionAttributeValues: {
          ':n': updateData.name,
          ':due': updateData.dueDate,
          ':dn': updateData.done
        },
        ReturnValues: 'UPDATED_NEW'
      })
      .promise();
      
      return updateData as TodoUpdate
  }

  async deleteTodo(userId: string, todoId: string): Promise<void> {
    await this.docClient
      .delete({
        TableName: this.todosTable,
        Key: { userId, todoId }
      })
      .promise();
    logger.info('Todo item deleted', userId)
  }

  async saveImgUrl(userId: string, todoId: string, bucketName: string): Promise<void> {
    logger.info('Save image url: ', userId)
    await this.docClient
      .update({
        TableName: this.todosTable,
        Key: { userId, todoId },
        ConditionExpression: 'attribute_exists(todoId)',
        UpdateExpression: 'set attachmentUrl = :attachmentUrl',
        ExpressionAttributeValues: {
          ':attachmentUrl': `https://${bucketName}.s3.amazonaws.com/${todoId}`
        }
      })
      .promise();
  }
}
