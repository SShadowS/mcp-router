import { getSqliteManager, SqliteManager } from "../core/sqlite-manager";
import { getServerRepository } from "../index";
import { TokenScope, Migration } from "@mcp_router/shared";
import { safeStorage } from "electron";

/**
 * Database migration management class
 * Centrally manages all migrations
 */
export class DatabaseMigration {
  private static instance: DatabaseMigration | null = null;
  // Registered migration list (ordered)
  private migrations: Migration[] = [];

  /**
   * Get singleton instance
   */
  public static getInstance(): DatabaseMigration {
    if (!DatabaseMigration.instance) {
      DatabaseMigration.instance = new DatabaseMigration();
    }
    return DatabaseMigration.instance;
  }

  /**
   * Constructor - register migrations
   */
  private constructor() {
    // Register migrations in execution order
    this.registerMigrations();
  }

  /**
   * Register all migrations to be executed
   * Add new migrations here
   */
  private registerMigrations(): void {
    // ServerRepository-related migrations
    this.migrations.push({
      id: "20250601_add_server_type_column",
      description: "Add server_type column to servers table",
      execute: (db) => this.migrateAddServerTypeColumn(db),
    });

    this.migrations.push({
      id: "20250602_add_remote_url_column",
      description: "Add remote_url column to servers table",
      execute: (db) => this.migrateAddRemoteUrlColumn(db),
    });

    this.migrations.push({
      id: "20250603_add_bearer_token_column",
      description: "Add bearer_token column to servers table",
      execute: (db) => this.migrateAddBearerTokenColumn(db),
    });

    this.migrations.push({
      id: "20250604_add_input_params_column",
      description: "Add input_params column to servers table",
      execute: (db) => this.migrateAddInputParamsColumn(db),
    });

    this.migrations.push({
      id: "20250605_add_description_column",
      description: "Add description column to servers table",
      execute: (db) => this.migrateAddDescriptionColumn(db),
    });

    this.migrations.push({
      id: "20250606_add_version_column",
      description: "Add version column to servers table",
      execute: (db) => this.migrateAddVersionColumn(db),
    });

    this.migrations.push({
      id: "20250607_add_latest_version_column",
      description: "Add latest_version column to servers table",
      execute: (db) => this.migrateAddLatestVersionColumn(db),
    });

    this.migrations.push({
      id: "20250608_add_verification_status_column",
      description: "Add verification_status column to servers table",
      execute: (db) => this.migrateAddVerificationStatusColumn(db),
    });

    this.migrations.push({
      id: "20250609_add_required_params_column",
      description: "Add required_params column to servers table",
      execute: (db) => this.migrateAddRequiredParamsColumn(db),
    });

    // AgentRepository-related migrations: agent table management
    this.migrations.push({
      id: "20250526_agent_table_management",
      description:
        "Manage agent tables: drop for reinitialization and add auto_execute_tool column to deployedAgents",
      execute: (db) => this.migrateAgentTableManagement(db),
    });

    // TokenRepository-related migrations
    this.migrations.push({
      id: "20250511_add_scopes_to_tokens",
      description:
        "Add scopes column to tokens table and populate with default scopes",
      execute: (db) => this.migrateTokensAddScopes(db),
    });

    // Data encryption migration
    this.migrations.push({
      id: "20250513_encrypt_server_data",
      description: "Encrypt server sensitive data",
      execute: (db) => this.migrateToEncryption(db),
    });

    // Add DeployedAgent original_id column
    this.migrations.push({
      id: "20250602_add_original_id_to_deployed_agents",
      description: "Add original_id column to deployedAgents table",
      execute: (db) => this.migrateAddOriginalIdToDeployedAgents(db),
    });

    // Add DeployedAgent mcp_server_enabled column
    this.migrations.push({
      id: "20250610_add_mcp_server_enabled_to_deployed_agents",
      description: "Add mcp_server_enabled column to deployedAgents table",
      execute: (db) => this.migrateAddMcpServerEnabledToDeployedAgents(db),
    });

    // Update ChatSessions table: add status/source
    this.migrations.push({
      id: "20250614_update_chat_sessions_schema",
      description: "Update chat_sessions table: add status/source columns",
      execute: (db) => this.migrateUpdateChatSessionsSchema(db),
    });

    // Ensure tokens table exists in main DB
    this.migrations.push({
      id: "20250627_ensure_tokens_table_in_main_db",
      description:
        "Ensure tokens table exists in main database for workspace sharing",
      execute: (db) => this.migrateEnsureTokensTableInMainDb(db),
    });

    // Add hooks table
    this.migrations.push({
      id: "20250805_add_hooks_table",
      description: "Add hooks table for MCP request/response hooks",
      execute: (db) => this.migrateAddHooksTable(db),
    });

    // Server tools table
    this.migrations.push({
      id: "20250828_initialize_server_tools_table",
      description: "Initialize server_tools table for tool management",
      execute: (db) => this.migrateInitializeServerToolsTable(db),
    });

    // Add client_id column to server_tools table for client-specific preferences
    this.migrations.push({
      id: "20250829_add_client_id_to_server_tools",
      description:
        "Add client_id column to server_tools table for client-specific tool preferences",
      execute: (db) => this.migrateAddClientIdToServerTools(db),
    });
  }

  /**
   * Execute all migrations
   */
  public runMigrations(): void {
    try {
      const db = getSqliteManager();

      // Initialize migration management table
      this.initMigrationTable();

      // Get completed migrations
      const completedMigrations = this.getCompletedMigrations();

      // Execute each migration (skip completed ones)
      for (const migration of this.migrations) {
        // 既に実行済みの場合はスキップ
        if (completedMigrations.has(migration.id)) {
          continue;
        }

        console.log(
          `マイグレーション ${migration.id} を実行中: ${migration.description}`,
        );

        try {
          // マイグレーションを実行（同期的に）
          migration.execute(db);

          // マイグレーションを完了としてマーク
          this.markMigrationComplete(migration.id);
        } catch (error) {
          throw error;
        }
      }
    } catch (error) {
      throw error;
    }
  }

  // ==========================================================================
  // Server Repository関連のマイグレーション
  // ==========================================================================

  /**
   * server_type列を追加するマイグレーション
   */
  private migrateAddServerTypeColumn(db: SqliteManager): void {
    try {
      // テーブルが存在するか確認
      const tableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'servers'",
        {},
      );

      if (!tableExists) {
        console.log(
          "serversテーブルが存在しないため、このマイグレーションをスキップします",
        );
        return;
      }

      // テーブル情報を取得
      const tableInfo = db.all("PRAGMA table_info(servers)");

      const columnNames = tableInfo.map((col: any) => col.name);

      // server_type列が存在しない場合は追加
      if (!columnNames.includes("server_type")) {
        console.log("serversテーブルにserver_type列を追加します");
        db.execute(
          "ALTER TABLE servers ADD COLUMN server_type TEXT NOT NULL DEFAULT 'local'",
        );
        console.log("server_type列の追加が完了しました");
      } else {
        console.log("server_type列は既に存在するため、追加をスキップします");
      }
    } catch (error) {
      console.error("server_type列の追加中にエラーが発生しました:", error);
      throw error;
    }
  }

  /**
   * remote_url列を追加するマイグレーション
   */
  private migrateAddRemoteUrlColumn(db: SqliteManager): void {
    try {
      // テーブルが存在するか確認
      const tableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'servers'",
        {},
      );

      if (!tableExists) {
        console.log(
          "serversテーブルが存在しないため、このマイグレーションをスキップします",
        );
        return;
      }

      // テーブル情報を取得
      const tableInfo = db.all("PRAGMA table_info(servers)");

      const columnNames = tableInfo.map((col: any) => col.name);

      // remote_url列が存在しない場合は追加
      if (!columnNames.includes("remote_url")) {
        console.log("serversテーブルにremote_url列を追加します");
        db.execute("ALTER TABLE servers ADD COLUMN remote_url TEXT");
        console.log("remote_url列の追加が完了しました");
      } else {
        console.log("remote_url列は既に存在するため、追加をスキップします");
      }
    } catch (error) {
      console.error("remote_url列の追加中にエラーが発生しました:", error);
      throw error;
    }
  }

  /**
   * bearer_token列を追加するマイグレーション
   */
  private migrateAddBearerTokenColumn(db: SqliteManager): void {
    try {
      // テーブルが存在するか確認
      const tableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'servers'",
        {},
      );

      if (!tableExists) {
        console.log(
          "serversテーブルが存在しないため、このマイグレーションをスキップします",
        );
        return;
      }

      // テーブル情報を取得
      const tableInfo = db.all("PRAGMA table_info(servers)");

      const columnNames = tableInfo.map((col: any) => col.name);

      // bearer_token列が存在しない場合は追加
      if (!columnNames.includes("bearer_token")) {
        console.log("serversテーブルにbearer_token列を追加します");
        db.execute("ALTER TABLE servers ADD COLUMN bearer_token TEXT");
        console.log("bearer_token列の追加が完了しました");
      } else {
        console.log("bearer_token列は既に存在するため、追加をスキップします");
      }
    } catch (error) {
      console.error("bearer_token列の追加中にエラーが発生しました:", error);
      throw error;
    }
  }

  /**
   * input_params列を追加するマイグレーション
   */
  private migrateAddInputParamsColumn(db: SqliteManager): void {
    try {
      // テーブルが存在するか確認
      const tableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'servers'",
        {},
      );

      if (!tableExists) {
        console.log(
          "serversテーブルが存在しないため、このマイグレーションをスキップします",
        );
        return;
      }

      // テーブル情報を取得
      const tableInfo = db.all("PRAGMA table_info(servers)");

      const columnNames = tableInfo.map((col: any) => col.name);

      // input_params列が存在しない場合は追加
      if (!columnNames.includes("input_params")) {
        console.log("serversテーブルにinput_params列を追加します");
        db.execute("ALTER TABLE servers ADD COLUMN input_params TEXT");
        console.log("input_params列の追加が完了しました");
      } else {
        console.log("input_params列は既に存在するため、追加をスキップします");
      }
    } catch (error) {
      console.error("input_params列の追加中にエラーが発生しました:", error);
      throw error;
    }
  }

  /**
   * description列を追加するマイグレーション
   */
  private migrateAddDescriptionColumn(db: SqliteManager): void {
    try {
      // テーブルが存在するか確認
      const tableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'servers'",
        {},
      );

      if (!tableExists) {
        console.log(
          "serversテーブルが存在しないため、このマイグレーションをスキップします",
        );
        return;
      }

      // テーブル情報を取得
      const tableInfo = db.all("PRAGMA table_info(servers)");

      const columnNames = tableInfo.map((col: any) => col.name);

      // description列が存在しない場合は追加
      if (!columnNames.includes("description")) {
        console.log("serversテーブルにdescription列を追加します");
        db.execute("ALTER TABLE servers ADD COLUMN description TEXT");
        console.log("description列の追加が完了しました");
      } else {
        console.log("description列は既に存在するため、追加をスキップします");
      }
    } catch (error) {
      console.error("description列の追加中にエラーが発生しました:", error);
      throw error;
    }
  }

  /**
   * version列を追加するマイグレーション
   */
  private migrateAddVersionColumn(db: SqliteManager): void {
    try {
      // テーブルが存在するか確認
      const tableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'servers'",
        {},
      );

      if (!tableExists) {
        console.log(
          "serversテーブルが存在しないため、このマイグレーションをスキップします",
        );
        return;
      }

      // テーブル情報を取得
      const tableInfo = db.all("PRAGMA table_info(servers)");

      const columnNames = tableInfo.map((col: any) => col.name);

      // version列が存在しない場合は追加
      if (!columnNames.includes("version")) {
        console.log("serversテーブルにversion列を追加します");
        db.execute("ALTER TABLE servers ADD COLUMN version TEXT");
        console.log("version列の追加が完了しました");
      } else {
        console.log("version列は既に存在するため、追加をスキップします");
      }
    } catch (error) {
      console.error("version列の追加中にエラーが発生しました:", error);
      throw error;
    }
  }

  /**
   * latest_version列を追加するマイグレーション
   */
  private migrateAddLatestVersionColumn(db: SqliteManager): void {
    try {
      // テーブルが存在するか確認
      const tableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'servers'",
        {},
      );

      if (!tableExists) {
        console.log(
          "serversテーブルが存在しないため、このマイグレーションをスキップします",
        );
        return;
      }

      // テーブル情報を取得
      const tableInfo = db.all("PRAGMA table_info(servers)");

      const columnNames = tableInfo.map((col: any) => col.name);

      // latest_version列が存在しない場合は追加
      if (!columnNames.includes("latest_version")) {
        console.log("serversテーブルにlatest_version列を追加します");
        db.execute("ALTER TABLE servers ADD COLUMN latest_version TEXT");
        console.log("latest_version列の追加が完了しました");
      } else {
        console.log("latest_version列は既に存在するため、追加をスキップします");
      }
    } catch (error) {
      console.error("latest_version列の追加中にエラーが発生しました:", error);
      throw error;
    }
  }

  /**
   * verification_status列を追加するマイグレーション
   */
  private migrateAddVerificationStatusColumn(db: SqliteManager): void {
    try {
      // テーブルが存在するか確認
      const tableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'servers'",
        {},
      );

      if (!tableExists) {
        console.log(
          "serversテーブルが存在しないため、このマイグレーションをスキップします",
        );
        return;
      }

      // テーブル情報を取得
      const tableInfo = db.all("PRAGMA table_info(servers)");

      const columnNames = tableInfo.map((col: any) => col.name);

      // verification_status列が存在しない場合は追加
      if (!columnNames.includes("verification_status")) {
        console.log("serversテーブルにverification_status列を追加します");
        db.execute("ALTER TABLE servers ADD COLUMN verification_status TEXT");
        console.log("verification_status列の追加が完了しました");
      } else {
        console.log(
          "verification_status列は既に存在するため、追加をスキップします",
        );
      }
    } catch (error) {
      console.error(
        "verification_status列の追加中にエラーが発生しました:",
        error,
      );
      throw error;
    }
  }

  /**
   * required_params列を追加するマイグレーション
   */
  private migrateAddRequiredParamsColumn(db: SqliteManager): void {
    try {
      // テーブルが存在するか確認
      const tableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'servers'",
        {},
      );

      if (!tableExists) {
        console.log(
          "serversテーブルが存在しないため、このマイグレーションをスキップします",
        );
        return;
      }

      // テーブル情報を取得
      const tableInfo = db.all("PRAGMA table_info(servers)");

      const columnNames = tableInfo.map((col: any) => col.name);

      // required_params列が存在しない場合は追加
      if (!columnNames.includes("required_params")) {
        console.log("serversテーブルにrequired_params列を追加します");
        db.execute("ALTER TABLE servers ADD COLUMN required_params TEXT");
        console.log("required_params列の追加が完了しました");
      } else {
        console.log(
          "required_params列は既に存在するため、追加をスキップします",
        );
      }
    } catch (error) {
      console.error("required_params列の追加中にエラーが発生しました:", error);
      throw error;
    }
  }

  // ==========================================================================
  // Token Repository関連のマイグレーション
  // ==========================================================================

  /**
   * トークンテーブルにスコープカラムを追加するマイグレーション
   */
  private migrateTokensAddScopes(db: SqliteManager): void {
    try {
      // テーブルが存在するか確認
      const tableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'tokens'",
        {},
      );

      if (!tableExists) {
        console.log(
          "tokensテーブルが存在しないため、このマイグレーションをスキップします",
        );
        return;
      }

      // スコープカラムがまだ存在しない場合は追加
      db.transaction(() => {
        // テーブル情報を取得
        const tableInfo = db.all("PRAGMA table_info(tokens)");

        // スコープカラムが存在しない場合は追加
        if (!tableInfo.some((column: any) => column.name === "scopes")) {
          db.execute("ALTER TABLE tokens ADD COLUMN scopes TEXT DEFAULT '[]'");
          console.log("トークンテーブルにスコープカラムを追加しました");
        } else {
          console.log("scopesカラムは既に存在するため、追加をスキップします");
          return;
        }

        // 既存のトークンに全スコープを付与
        const scopesJson = JSON.stringify([
          TokenScope.MCP_SERVER_MANAGEMENT,
          TokenScope.LOG_MANAGEMENT,
          TokenScope.APPLICATION,
        ]);

        db.execute(
          "UPDATE tokens SET scopes = :scopes WHERE scopes IS NULL OR scopes = '[]'",
          { scopes: scopesJson },
        );

        console.log("既存のトークンに全スコープを付与しました");
      });
    } catch (error) {
      console.error(
        "トークンテーブルのスコープカラム追加中にエラーが発生しました:",
        error,
      );
      throw error;
    }
  }

  /**
   * エージェントテーブル管理の統合マイグレーション
   * - agentsテーブルとdeployedAgentsテーブルを削除して再初期化を可能にする
   * - deployedAgentsテーブルにauto_execute_tool列を追加する
   */
  private migrateAgentTableManagement(db: SqliteManager): void {
    try {
      // 既存のagentsテーブルとdeployedAgentsテーブルを削除
      const agentsTableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'agents'",
        {},
      );

      const deployedAgentsTableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'deployedAgents'",
        {},
      );

      if (agentsTableExists || deployedAgentsTableExists) {
        console.log("既存のエージェントテーブルを削除します");
        db.execute("DROP TABLE IF EXISTS agents");
        db.execute("DROP TABLE IF EXISTS deployedAgents");
        console.log(
          "エージェントテーブルの削除が完了しました。次回のアプリケーション起動時にAgentRepositoryによって再作成されます。",
        );
      } else {
        console.log(
          "エージェントテーブルが存在しないため、削除処理をスキップします",
        );
      }

      // 注意: auto_execute_tool列の追加は、テーブルが再作成される際に
      // AgentRepositoryのスキーマ定義に含まれるため、ここでは不要
      console.log("エージェントテーブル管理マイグレーションが完了しました");
    } catch (error) {
      console.error(
        "エージェントテーブル管理マイグレーション中にエラーが発生しました:",
        error,
      );
      throw error;
    }
  }

  /**
   * deployedAgentsテーブルにoriginal_id列を追加するマイグレーション
   */
  private migrateAddOriginalIdToDeployedAgents(db: SqliteManager): void {
    try {
      // テーブルが存在するか確認
      const tableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'deployedAgents'",
        {},
      );

      if (!tableExists) {
        console.log(
          "deployedAgentsテーブルが存在しないため、このマイグレーションをスキップします",
        );
        return;
      }

      // テーブル情報を取得
      const tableInfo = db.all("PRAGMA table_info(deployedAgents)");

      const columnNames = tableInfo.map((col: any) => col.name);

      // original_id列が存在しない場合は追加
      if (!columnNames.includes("original_id")) {
        console.log("deployedAgentsテーブルにoriginal_id列を追加します");
        db.execute(
          "ALTER TABLE deployedAgents ADD COLUMN original_id TEXT NOT NULL DEFAULT ''",
        );
        console.log("original_id列の追加が完了しました");
      } else {
        console.log("original_id列は既に存在するため、追加をスキップします");
      }
    } catch (error) {
      console.error("original_id列の追加中にエラーが発生しました:", error);
      throw error;
    }
  }

  /**
   * deployedAgentsテーブルにmcp_server_enabled列を追加するマイグレーション
   */
  private migrateAddMcpServerEnabledToDeployedAgents(db: SqliteManager): void {
    try {
      // テーブルが存在するか確認
      const tableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'deployedAgents'",
        {},
      );

      if (!tableExists) {
        console.log(
          "deployedAgentsテーブルが存在しないため、このマイグレーションをスキップします",
        );
        return;
      }

      // テーブル情報を取得
      const tableInfo = db.all("PRAGMA table_info(deployedAgents)");

      const columnNames = tableInfo.map((col: any) => col.name);

      // mcp_server_enabled列が存在しない場合は追加
      if (!columnNames.includes("mcp_server_enabled")) {
        console.log("deployedAgentsテーブルにmcp_server_enabled列を追加します");
        db.execute(
          "ALTER TABLE deployedAgents ADD COLUMN mcp_server_enabled INTEGER DEFAULT 0",
        );
        console.log("mcp_server_enabled列の追加が完了しました");
      } else {
        console.log(
          "mcp_server_enabled列は既に存在するため、追加をスキップします",
        );
      }
    } catch (error) {
      console.error(
        "mcp_server_enabled列の追加中にエラーが発生しました:",
        error,
      );
      throw error;
    }
  }

  /**
   * chat_sessionsテーブルのスキーマを更新するマイグレーション
   * - status列とsource列を追加
   */
  private migrateUpdateChatSessionsSchema(db: SqliteManager): void {
    try {
      // テーブルが存在するか確認
      const tableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'chat_sessions'",
        {},
      );

      if (!tableExists) {
        return;
      }

      // テーブル情報を取得
      const tableInfo = db.all("PRAGMA table_info(chat_sessions)");

      const columnNames = tableInfo.map((col: any) => col.name);

      // status列が存在しない場合は追加
      if (!columnNames.includes("status")) {
        db.execute(
          "ALTER TABLE chat_sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'",
        );
      }
      // source列が存在しない場合は追加
      if (!columnNames.includes("source")) {
        db.execute(
          "ALTER TABLE chat_sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'ui'",
        );
      }

      // statusインデックスが存在しない場合は作成
      db.execute(
        "CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status)",
      );
    } catch (error) {
      console.error(
        "chat_sessionsテーブルのスキーマ更新中にエラーが発生しました:",
        error,
      );
      throw error;
    }
  }

  /**
   * トークンテーブルをメインDBに確実に作成するマイグレーション
   */
  private migrateEnsureTokensTableInMainDb(db: SqliteManager): void {
    try {
      // tokensテーブルの作成はTokenRepositoryで行うため、ここでは何もしない
      console.log("tokensテーブルの作成はTokenRepositoryに委譲されます");
    } catch (error) {
      console.error("tokensテーブルの作成中にエラーが発生しました:", error);
      throw error;
    }
  }

  /**
   * 既存のプレーンテキストデータを暗号化形式に移行
   * アプリケーション起動時に呼び出される（同期的に処理）
   */
  private migrateToEncryption(db: SqliteManager): void {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn(
          "セキュア暗号化は現在のシステムで利用できません。データ移行をスキップします。",
        );
        return;
      }

      // サーバーリポジトリを取得
      const serverRepository = getServerRepository();

      // すべてのサーバーを取得
      const allServers = serverRepository.getAllServers();

      if (allServers.length === 0) {
        console.log(
          "サーバーが存在しないため、暗号化マイグレーションをスキップします",
        );
        return;
      }

      let migratedCount = 0;

      // 各サーバーを再保存して暗号化を適用
      for (const server of allServers) {
        try {
          // 保存時にmapEntityToRowForUpdateが呼ばれ、データが暗号化される
          // bearerToken, env, inputParams, args, remote_urlが暗号化対象
          serverRepository.updateServer(server.id, {});
          migratedCount++;
        } catch (error) {
          console.error(
            `サーバー "${server.name}" (ID: ${server.id}) の暗号化に失敗しました:`,
            error,
          );
        }
      }

      console.log(`${migratedCount}個のサーバーデータを暗号化しました`);
    } catch (error) {
      console.error(
        "サーバーデータの暗号化移行中にエラーが発生しました:",
        error,
      );
      throw error; // マイグレーションエラーは上位に伝播させる
    }
  }

  // ==========================================================================
  // マイグレーション管理ユーティリティ
  // ==========================================================================

  /**
   * マイグレーション管理テーブルの初期化
   */
  private initMigrationTable(): void {
    const db = getSqliteManager();

    // マイグレーション管理テーブルの作成
    db.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        executed_at INTEGER NOT NULL
      )
    `);
  }

  /**
   * 実行済みマイグレーションのリストを取得
   */
  private getCompletedMigrations(): Set<string> {
    const db = getSqliteManager();

    // 実行済みマイグレーションを取得
    const rows = db.all<{ id: string }>("SELECT id FROM migrations");

    // Set に変換して返す
    return new Set(rows.map((row: any) => row.id));
  }

  /**
   * マイグレーションを記録
   */
  private markMigrationComplete(migrationId: string): void {
    const db = getSqliteManager();

    // マイグレーションを記録
    db.execute(
      "INSERT INTO migrations (id, executed_at) VALUES (:id, :executedAt)",
      {
        id: migrationId,
        executedAt: Math.floor(Date.now() / 1000),
      },
    );
  }

  /**
   * hooksテーブルを追加するマイグレーション
   */
  private migrateAddHooksTable(db: SqliteManager): void {
    try {
      // HookRepositoryが初めて呼ばれた時に
      // テーブルが作成されるため、ここでは何もしない
      console.log("hooksテーブルの作成はHookRepositoryに委譲されます");
    } catch (error) {
      console.error(
        "hooksテーブルのマイグレーション中にエラーが発生しました:",
        error,
      );
      throw error;
    }
  }

  /**
   * server_toolsテーブルを初期化するマイグレーション
   */
  private migrateInitializeServerToolsTable(db: SqliteManager): void {
    try {
      // Check if table exists
      const tableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='server_tools'",
      );

      if (!tableExists) {
        console.log("Creating server_tools table...");

        // Create the server_tools table
        db.exec(`
          CREATE TABLE IF NOT EXISTS server_tools (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            original_description TEXT,
            custom_name TEXT,
            custom_description TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
            UNIQUE(server_id, tool_name)
          )
        `);

        // Create indexes
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_server_tools_server_id ON server_tools(server_id)",
        );
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_server_tools_enabled ON server_tools(enabled)",
        );

        console.log("server_tools table created successfully");
      } else {
        console.log(
          "server_tools table already exists, checking for missing columns...",
        );

        // Check if original_description column exists
        const columns = db.all("PRAGMA table_info(server_tools)") as Array<{
          name: string;
        }>;

        const columnNames = columns.map((col) => col.name);

        // Add original_description column if it doesn't exist
        if (!columnNames.includes("original_description")) {
          console.log("Adding missing original_description column...");
          db.exec(
            "ALTER TABLE server_tools ADD COLUMN original_description TEXT",
          );
          console.log("original_description column added successfully");
        }

        // Add custom_name column if it doesn't exist
        if (!columnNames.includes("custom_name")) {
          console.log("Adding missing custom_name column...");
          db.exec("ALTER TABLE server_tools ADD COLUMN custom_name TEXT");
          console.log("custom_name column added successfully");
        }

        // Add custom_description column if it doesn't exist
        if (!columnNames.includes("custom_description")) {
          console.log("Adding missing custom_description column...");
          db.exec(
            "ALTER TABLE server_tools ADD COLUMN custom_description TEXT",
          );
          console.log("custom_description column added successfully");
        }
      }
    } catch (error) {
      console.error("Error during server_tools table migration:", error);
      throw error;
    }
  }

  /**
   * Add client_id column to server_tools table for client-specific tool preferences
   */
  private migrateAddClientIdToServerTools(db: SqliteManager): void {
    try {
      // Check if table exists
      const tableExists = db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='server_tools'",
      );

      if (!tableExists) {
        console.log(
          "server_tools table doesn't exist, skipping client_id migration",
        );
        return;
      }

      // Get table info
      const columns = db.all("PRAGMA table_info(server_tools)") as Array<{
        name: string;
      }>;

      const columnNames = columns.map((col) => col.name);

      // Add client_id column if it doesn't exist
      if (!columnNames.includes("client_id")) {
        console.log("Adding client_id column to server_tools table...");

        // Add the column
        db.exec("ALTER TABLE server_tools ADD COLUMN client_id TEXT");

        // Drop old unique constraint and create new one
        // SQLite doesn't support DROP CONSTRAINT, so we need to recreate the table
        console.log("Updating unique constraint to include client_id...");

        // Create temporary table with new schema
        db.exec(`
          CREATE TABLE server_tools_new (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            client_id TEXT,
            enabled INTEGER NOT NULL DEFAULT 1,
            original_description TEXT,
            custom_name TEXT,
            custom_description TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
            UNIQUE(server_id, tool_name, client_id)
          )
        `);

        // Copy data from old table
        db.exec(`
          INSERT INTO server_tools_new (
            id, server_id, tool_name, client_id, enabled, 
            original_description, custom_name, custom_description, 
            created_at, updated_at
          )
          SELECT 
            id, server_id, tool_name, NULL, enabled, 
            original_description, custom_name, custom_description, 
            created_at, updated_at
          FROM server_tools
        `);

        // Drop old table and rename new one
        db.exec("DROP TABLE server_tools");
        db.exec("ALTER TABLE server_tools_new RENAME TO server_tools");

        // Recreate indexes
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_server_tools_server_id ON server_tools(server_id)",
        );
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_server_tools_enabled ON server_tools(enabled)",
        );
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_server_tools_client_id ON server_tools(client_id)",
        );

        console.log(
          "client_id column and new unique constraint added successfully",
        );
      } else {
        console.log("client_id column already exists, skipping migration");
      }
    } catch (error) {
      console.error("Error adding client_id column to server_tools:", error);
      throw error;
    }
  }
}

/**
 * データベースマイグレーションのシングルトンインスタンスを取得
 */
export function getDatabaseMigration(): DatabaseMigration {
  return DatabaseMigration.getInstance();
}
