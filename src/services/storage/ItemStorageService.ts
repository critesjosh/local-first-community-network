import Database from './Database';
import {IrlItem} from '../../types/models';

class ItemStorageService {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await Database.init();
    this.initialized = true;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  async saveItem(item: IrlItem): Promise<void> {
    await this.ensureInitialized();
    await Database.saveIrlItem(item);
  }

  async listItems(limit?: number, offset?: number): Promise<IrlItem[]> {
    await this.ensureInitialized();
    return Database.getIrlItems(limit, offset);
  }

  async listItemsForConnection(connectionId: string): Promise<IrlItem[]> {
    await this.ensureInitialized();
    return Database.getIrlItemsByConnection(connectionId);
  }

  async markItemSynced(itemId: string, syncedAt?: Date): Promise<void> {
    await this.ensureInitialized();
    await Database.markIrlItemSynced(itemId, syncedAt);
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.ensureInitialized();
    await Database.deleteIrlItem(itemId);
  }
}

export default new ItemStorageService();

