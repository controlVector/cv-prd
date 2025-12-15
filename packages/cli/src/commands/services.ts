/**
 * cv services - Manage ControlVector service connections
 *
 * Commands:
 *   cv services           Show status of all services
 *   cv services add       Add/update a service URL
 *   cv services remove    Remove a service configuration
 *   cv services discover  Auto-discover services on network
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  discoverAllServices,
  discoverCvPrd,
  discoverQdrant,
  discoverFalkorDB,
  saveServices,
  getServiceStatus
} from '../utils/services.js';

export function servicesCommand(): Command {
  const cmd = new Command('services')
    .description('Manage ControlVector service connections');

  // Default action: show status
  cmd.action(async () => {
    console.log(chalk.bold('\nControlVector Services:\n'));

    const spinner = ora('Checking services...').start();

    try {
      const statuses = await getServiceStatus();
      spinner.stop();

      for (const svc of statuses) {
        const icon = svc.status === 'connected' ? chalk.green('●') :
          svc.status === 'configured' ? chalk.yellow('●') : chalk.red('●');
        const statusText = svc.status === 'connected' ? chalk.green('connected') :
          svc.status === 'configured' ? chalk.yellow('configured') : chalk.red('not found');

        console.log(`  ${icon} ${chalk.bold(svc.name)}`);
        if (svc.url) {
          console.log(`    URL: ${chalk.cyan(svc.url)}`);
        }
        console.log(`    Status: ${statusText}`);
        console.log();
      }

      console.log(chalk.gray('Use `cv services add <name> <url>` to configure services'));
      console.log(chalk.gray('Use `cv services discover` to auto-detect services'));
    } catch (error) {
      spinner.fail('Failed to check services');
      console.error(chalk.red(`Error: ${error}`));
    }
  });

  // Add/update a service
  cmd
    .command('add <name> <url>')
    .description('Add or update a service URL')
    .action(async (name: string, url: string) => {
      const validNames = ['prd', 'cv-prd', 'qdrant', 'falkordb', 'ollama'];
      const normalizedName = name.toLowerCase().replace('cv-', '');

      if (!validNames.includes(normalizedName) && !validNames.includes(name)) {
        console.log(chalk.red(`Unknown service: ${name}`));
        console.log(chalk.gray(`Valid services: ${validNames.join(', ')}`));
        return;
      }

      // Map to config key
      const configKey = normalizedName === 'prd' ? 'cvPrd' :
        normalizedName === 'cv-prd' ? 'cvPrd' : normalizedName;

      const spinner = ora(`Configuring ${name}...`).start();

      try {
        // Verify URL format
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('redis://')) {
          // Auto-prefix
          if (configKey === 'falkordb') {
            url = `redis://${url}`;
          } else {
            url = `http://${url}`;
          }
        }

        // Test connection
        spinner.text = `Testing connection to ${url}...`;

        let isValid = false;
        if (configKey === 'cvPrd') {
          const res = await fetch(`${url}/api/v1/health`, {
            signal: AbortSignal.timeout(5000)
          });
          isValid = res.ok;
        } else if (configKey === 'qdrant') {
          const res = await fetch(url, {
            signal: AbortSignal.timeout(5000)
          });
          isValid = res.ok;
        } else {
          // For redis/ollama, we'll trust the user
          isValid = true;
        }

        if (!isValid) {
          spinner.warn(`Could not verify ${name} at ${url}, but saving anyway`);
        }

        // Save to config
        const currentServices = await discoverAllServices();
        await saveServices({
          cvPrd: configKey === 'cvPrd' ? url : currentServices.cvPrd || undefined,
          qdrant: configKey === 'qdrant' ? url : currentServices.qdrant || undefined,
          falkordb: configKey === 'falkordb' ? url : currentServices.falkordb || undefined,
        });

        if (isValid) {
          spinner.succeed(`Configured ${chalk.cyan(name)} → ${chalk.green(url)}`);
        }
      } catch (error) {
        spinner.fail(`Failed to configure ${name}`);
        console.error(chalk.red(`Error: ${error}`));
      }
    });

  // Remove a service
  cmd
    .command('remove <name>')
    .description('Remove a service configuration')
    .action(async (name: string) => {
      const configKey = name.toLowerCase() === 'prd' || name.toLowerCase() === 'cv-prd'
        ? 'cvPrd' : name.toLowerCase();

      const spinner = ora(`Removing ${name}...`).start();

      try {
        const currentServices = await discoverAllServices();
        const updated: Record<string, string | undefined> = {
          cvPrd: currentServices.cvPrd || undefined,
          qdrant: currentServices.qdrant || undefined,
          falkordb: currentServices.falkordb || undefined,
        };

        delete updated[configKey];

        await saveServices(updated);
        spinner.succeed(`Removed ${chalk.cyan(name)} from configuration`);
        console.log(chalk.gray('Service will now be auto-discovered on localhost'));
      } catch (error) {
        spinner.fail(`Failed to remove ${name}`);
        console.error(chalk.red(`Error: ${error}`));
      }
    });

  // Auto-discover services
  cmd
    .command('discover')
    .description('Auto-discover services on localhost')
    .option('--save', 'Save discovered URLs to config')
    .action(async (options) => {
      console.log(chalk.bold('\nDiscovering services...\n'));

      const spinner = ora('Scanning...').start();

      try {
        // Discover each service
        spinner.text = 'Looking for cv-prd...';
        const cvPrd = await discoverCvPrd();

        spinner.text = 'Looking for Qdrant...';
        const qdrant = await discoverQdrant();

        spinner.text = 'Looking for FalkorDB...';
        const falkordb = await discoverFalkorDB();

        spinner.stop();

        // Display results
        const results = [
          { name: 'cv-prd', url: cvPrd },
          { name: 'Qdrant', url: qdrant },
          { name: 'FalkorDB', url: falkordb }
        ];

        for (const svc of results) {
          if (svc.url) {
            console.log(`  ${chalk.green('✔')} ${chalk.bold(svc.name)}: ${chalk.cyan(svc.url)}`);
          } else {
            console.log(`  ${chalk.red('✖')} ${chalk.bold(svc.name)}: not found`);
          }
        }

        // Save if requested
        if (options.save) {
          console.log();
          const saveSpinner = ora('Saving configuration...').start();
          await saveServices({
            cvPrd: cvPrd || undefined,
            qdrant: qdrant || undefined,
            falkordb: falkordb || undefined
          });
          saveSpinner.succeed('Configuration saved to ~/.cv/services.json');
        } else {
          console.log(chalk.gray('\nUse --save to persist these URLs'));
        }
      } catch (error) {
        spinner.fail('Discovery failed');
        console.error(chalk.red(`Error: ${error}`));
      }
    });

  return cmd;
}
