import { Dataset } from "@agentic-csv/domain";
import type { Command, CommandHandler } from "../../cqrs/command";
import type { DatasetRepository } from "../../ports/dataset-repository";
import type { EventPublisher } from "../../ports/event-publisher";

export const createDatasetCommandType = "dataset.create.v1";

export interface CreateDatasetResult {
  readonly datasetId: string;
  readonly status: string;
}

export interface CreateDatasetCommand extends Command<CreateDatasetResult> {
  readonly type: typeof createDatasetCommandType;
  readonly ownerId: string;
  readonly name: string;
  readonly originalFilename: string;
}

export class CreateDatasetCommandHandler implements CommandHandler<
  CreateDatasetCommand,
  CreateDatasetResult
> {
  public constructor(
    private readonly repository: DatasetRepository,
    private readonly eventPublisher: EventPublisher
  ) {}

  public async execute(command: CreateDatasetCommand): Promise<CreateDatasetResult> {
    const dataset = Dataset.create({
      ownerId: command.ownerId,
      name: command.name,
      originalFilename: command.originalFilename
    });

    const events = dataset.pullDomainEvents();
    await this.repository.save(dataset);
    await this.eventPublisher.publish(events);

    return {
      datasetId: dataset.id.toString(),
      status: dataset.status
    };
  }
}
