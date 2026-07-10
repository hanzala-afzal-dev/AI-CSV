import { Dataset } from "@agentic-csv/domain";
import type { DatasetStatus } from "@agentic-csv/domain";
import type { Command, CommandHandler } from "../../cqrs/command";
import type { UnitOfWork } from "../../ports/unit-of-work";

export const createDatasetCommandType = "dataset.create.v1";

export interface CreateDatasetResult {
  readonly datasetId: string;
  readonly userId: string;
  readonly name: string;
  readonly originalFilename: string;
  readonly status: DatasetStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateDatasetCommand extends Command<CreateDatasetResult> {
  readonly type: typeof createDatasetCommandType;
  readonly userId: string;
  readonly name: string;
  readonly originalFilename: string;
}

export class CreateDatasetCommandHandler implements CommandHandler<
  CreateDatasetCommand,
  CreateDatasetResult
> {
  public constructor(private readonly unitOfWork: UnitOfWork) {}

  public async execute(command: CreateDatasetCommand): Promise<CreateDatasetResult> {
    const dataset = Dataset.create({
      userId: command.userId,
      name: command.name,
      originalFilename: command.originalFilename
    });

    const events = dataset.pullDomainEvents();
    await this.unitOfWork.executeForUser(command.userId, async (transaction) => {
      await transaction.datasets.save(dataset);
      await transaction.events.publish(events);
    });

    return {
      datasetId: dataset.id.toString(),
      userId: dataset.userId,
      name: dataset.name,
      originalFilename: dataset.originalFilename,
      status: dataset.status,
      createdAt: dataset.toPrimitives().createdAt,
      updatedAt: dataset.toPrimitives().updatedAt
    };
  }
}
