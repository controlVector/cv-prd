/**
 * System Capabilities Detection
 * Detects GPU, RAM, and CPU to advise on local model selection
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

/**
 * GPU information
 */
export interface GPUInfo {
  detected: boolean;
  type: 'nvidia' | 'amd' | 'apple' | 'intel' | 'none';
  name?: string;
  vramMB?: number;
  vramFreeMB?: number;
}

/**
 * System capabilities
 */
export interface SystemCapabilities {
  gpu: GPUInfo;
  ramMB: number;
  ramFreeMB: number;
  cpuCores: number;
  cpuModel: string;
  platform: NodeJS.Platform;
  canRunLocalModels: boolean;
}

/**
 * Model recommendation based on system capabilities
 */
export interface ModelRecommendation {
  modelId: string;
  modelName: string;
  reason: string;
  warning?: string;
  estimatedPerformance: 'fast' | 'moderate' | 'slow' | 'not-recommended';
}

/**
 * System assessment result
 */
export interface SystemAssessment {
  capabilities: SystemCapabilities;
  canRunLocal: boolean;
  recommendedModels: ModelRecommendation[];
  warnings: string[];
  suggestion: string;
}

/**
 * Detect NVIDIA GPU using nvidia-smi
 */
async function detectNvidiaGPU(): Promise<GPUInfo | null> {
  try {
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits'
    );

    const lines = stdout.trim().split('\n');
    if (lines.length > 0 && lines[0]) {
      const parts = lines[0].split(',').map(s => s.trim());
      if (parts.length >= 3) {
        return {
          detected: true,
          type: 'nvidia',
          name: parts[0],
          vramMB: parseInt(parts[1], 10),
          vramFreeMB: parseInt(parts[2], 10),
        };
      }
    }
  } catch {
    // nvidia-smi not available
  }
  return null;
}

/**
 * Detect AMD GPU using rocm-smi
 */
async function detectAMDGPU(): Promise<GPUInfo | null> {
  try {
    const { stdout } = await execAsync('rocm-smi --showmeminfo vram --json');
    const data = JSON.parse(stdout);
    // ROCm output format varies, this is a simplified check
    if (data && Object.keys(data).length > 0) {
      const gpuKey = Object.keys(data)[0];
      const gpuData = data[gpuKey];
      return {
        detected: true,
        type: 'amd',
        name: gpuKey,
        vramMB: gpuData?.['VRAM Total Memory (B)']
          ? Math.floor(gpuData['VRAM Total Memory (B)'] / 1024 / 1024)
          : undefined,
      };
    }
  } catch {
    // rocm-smi not available
  }
  return null;
}

/**
 * Detect Apple Silicon GPU (unified memory)
 */
async function detectAppleGPU(): Promise<GPUInfo | null> {
  if (process.platform !== 'darwin') return null;

  try {
    const { stdout } = await execAsync('sysctl -n machdep.cpu.brand_string');
    if (stdout.includes('Apple')) {
      // Apple Silicon uses unified memory, so VRAM = system RAM
      const totalMem = os.totalmem();
      return {
        detected: true,
        type: 'apple',
        name: stdout.trim(),
        vramMB: Math.floor(totalMem / 1024 / 1024),
      };
    }
  } catch {
    // Not Apple Silicon
  }
  return null;
}

/**
 * Detect Intel integrated GPU
 */
async function detectIntelGPU(): Promise<GPUInfo | null> {
  try {
    if (process.platform === 'linux') {
      const { stdout } = await execAsync('lspci | grep -i "vga\\|3d\\|display"');
      if (stdout.toLowerCase().includes('intel')) {
        // Intel iGPU shares system memory
        return {
          detected: true,
          type: 'intel',
          name: 'Intel Integrated Graphics',
          // Intel iGPU typically can use up to half of system RAM
          vramMB: Math.floor(os.totalmem() / 1024 / 1024 / 2),
        };
      }
    }
  } catch {
    // lspci not available
  }
  return null;
}

/**
 * Get Linux memory info
 */
async function getLinuxMemory(): Promise<{ total: number; free: number } | null> {
  try {
    const { stdout } = await execAsync('cat /proc/meminfo');
    const lines = stdout.split('\n');
    let total = 0;
    let available = 0;

    for (const line of lines) {
      if (line.startsWith('MemTotal:')) {
        total = parseInt(line.split(/\s+/)[1], 10) / 1024; // KB to MB
      } else if (line.startsWith('MemAvailable:')) {
        available = parseInt(line.split(/\s+/)[1], 10) / 1024;
      }
    }

    if (total > 0) {
      return { total: Math.floor(total), free: Math.floor(available) };
    }
  } catch {
    // /proc/meminfo not available
  }
  return null;
}

/**
 * Detect system capabilities
 */
export async function detectSystemCapabilities(): Promise<SystemCapabilities> {
  // Detect GPU (try each type)
  let gpu: GPUInfo = { detected: false, type: 'none' };

  const nvidia = await detectNvidiaGPU();
  if (nvidia) {
    gpu = nvidia;
  } else {
    const amd = await detectAMDGPU();
    if (amd) {
      gpu = amd;
    } else {
      const apple = await detectAppleGPU();
      if (apple) {
        gpu = apple;
      } else {
        const intel = await detectIntelGPU();
        if (intel) {
          gpu = intel;
        }
      }
    }
  }

  // Get memory info
  let ramMB = Math.floor(os.totalmem() / 1024 / 1024);
  let ramFreeMB = Math.floor(os.freemem() / 1024 / 1024);

  // On Linux, try to get more accurate available memory
  if (process.platform === 'linux') {
    const linuxMem = await getLinuxMemory();
    if (linuxMem) {
      ramMB = linuxMem.total;
      ramFreeMB = linuxMem.free;
    }
  }

  // Get CPU info
  const cpus = os.cpus();
  const cpuCores = cpus.length;
  const cpuModel = cpus[0]?.model || 'Unknown';

  // Determine if local models can run
  // Minimum: 8GB RAM for smallest models (CPU inference)
  // Recommended: discrete GPU with 8GB+ VRAM
  const canRunLocalModels = ramMB >= 8192 || (gpu.detected && (gpu.vramMB || 0) >= 4096);

  return {
    gpu,
    ramMB,
    ramFreeMB,
    cpuCores,
    cpuModel,
    platform: process.platform,
    canRunLocalModels,
  };
}

/**
 * Model requirements (approximate)
 */
const MODEL_REQUIREMENTS: Record<string, { vramMB: number; ramMB: number; description: string }> = {
  'qwen2.5-coder:32b': { vramMB: 24000, ramMB: 32000, description: 'Best quality, needs powerful GPU' },
  'qwen2.5-coder:14b': { vramMB: 12000, ramMB: 16000, description: 'Great balance of quality and speed' },
  'qwen2.5-coder:7b': { vramMB: 8000, ramMB: 10000, description: 'Good for most tasks' },
  'deepseek-coder-v2:16b': { vramMB: 12000, ramMB: 16000, description: 'Strong with long context' },
  'codellama:13b': { vramMB: 10000, ramMB: 14000, description: 'Meta\'s coding model' },
  'codellama:7b': { vramMB: 6000, ramMB: 8000, description: 'Lightweight Meta model' },
  'llama3.1:8b': { vramMB: 8000, ramMB: 10000, description: 'Fast general model' },
  'phi3:mini': { vramMB: 4000, ramMB: 6000, description: 'Microsoft\'s small model' },
  'gemma2:2b': { vramMB: 2000, ramMB: 4000, description: 'Google\'s tiny model' },
};

/**
 * Assess system and recommend models
 */
export async function assessSystemForLocalModels(): Promise<SystemAssessment> {
  const capabilities = await detectSystemCapabilities();
  const warnings: string[] = [];
  const recommendedModels: ModelRecommendation[] = [];

  // Determine available compute
  const hasGPU = capabilities.gpu.detected && capabilities.gpu.type !== 'intel';
  const vram = capabilities.gpu.vramMB || 0;
  const ram = capabilities.ramMB;

  // Check basic viability
  if (!capabilities.canRunLocalModels) {
    return {
      capabilities,
      canRunLocal: false,
      recommendedModels: [],
      warnings: ['Insufficient resources for local model inference'],
      suggestion: 'Your system does not meet minimum requirements for local models. ' +
        'Consider using cloud providers (OpenRouter) instead: cv code -p openrouter',
    };
  }

  // Add warnings based on configuration
  if (!hasGPU) {
    warnings.push('No dedicated GPU detected - models will run on CPU (slower)');
  } else if (capabilities.gpu.type === 'intel') {
    warnings.push('Intel integrated GPU detected - limited acceleration available');
  }

  if (capabilities.gpu.type === 'amd') {
    warnings.push('AMD GPU detected - ensure ROCm is properly configured for Ollama');
  }

  // Recommend models based on available resources
  const availableCompute = hasGPU ? vram : ram;

  for (const [modelId, req] of Object.entries(MODEL_REQUIREMENTS)) {
    const neededCompute = hasGPU ? req.vramMB : req.ramMB;

    if (availableCompute >= neededCompute) {
      // Model can run
      const headroom = availableCompute / neededCompute;
      let performance: 'fast' | 'moderate' | 'slow' = 'moderate';

      if (headroom >= 1.5) {
        performance = 'fast';
      } else if (headroom < 1.1) {
        performance = 'slow';
      }

      // Slower if running on CPU
      if (!hasGPU && performance === 'fast') {
        performance = 'moderate';
      } else if (!hasGPU && performance === 'moderate') {
        performance = 'slow';
      }

      recommendedModels.push({
        modelId,
        modelName: modelId.split(':')[0],
        reason: req.description,
        estimatedPerformance: performance,
        warning: !hasGPU ? 'Will run on CPU' : undefined,
      });
    } else if (availableCompute >= neededCompute * 0.8) {
      // Model might run but will be slow/swap
      recommendedModels.push({
        modelId,
        modelName: modelId.split(':')[0],
        reason: req.description,
        estimatedPerformance: 'not-recommended',
        warning: `Needs ~${Math.round(neededCompute / 1024)}GB, you have ~${Math.round(availableCompute / 1024)}GB`,
      });
    }
  }

  // Sort by performance (best first)
  const perfOrder = { 'fast': 0, 'moderate': 1, 'slow': 2, 'not-recommended': 3 };
  recommendedModels.sort((a, b) => perfOrder[a.estimatedPerformance] - perfOrder[b.estimatedPerformance]);

  // Build suggestion
  let suggestion: string;
  const bestModel = recommendedModels.find(m => m.estimatedPerformance !== 'not-recommended');

  if (bestModel) {
    suggestion = `Recommended: ${bestModel.modelId} (${bestModel.estimatedPerformance} performance)\n` +
      `Install with: ollama pull ${bestModel.modelId}`;
  } else if (recommendedModels.length > 0) {
    suggestion = 'Your system can run small models but performance may be limited.\n' +
      'Consider using cloud providers for better experience: cv code -p openrouter';
  } else {
    suggestion = 'No suitable local models found for your hardware.\n' +
      'Use cloud providers instead: cv code -p openrouter';
  }

  return {
    capabilities,
    canRunLocal: recommendedModels.some(m => m.estimatedPerformance !== 'not-recommended'),
    recommendedModels,
    warnings,
    suggestion,
  };
}

/**
 * Format system assessment for display
 */
export function formatSystemAssessment(assessment: SystemAssessment): string {
  const lines: string[] = [];
  const cap = assessment.capabilities;

  lines.push('System Capabilities:');
  lines.push('');

  // GPU
  if (cap.gpu.detected) {
    const vramStr = cap.gpu.vramMB ? ` (${Math.round(cap.gpu.vramMB / 1024)}GB VRAM)` : '';
    lines.push(`  GPU: ${cap.gpu.name || cap.gpu.type}${vramStr}`);
  } else {
    lines.push('  GPU: None detected');
  }

  // RAM
  lines.push(`  RAM: ${Math.round(cap.ramMB / 1024)}GB (${Math.round(cap.ramFreeMB / 1024)}GB available)`);

  // CPU
  lines.push(`  CPU: ${cap.cpuModel} (${cap.cpuCores} cores)`);
  lines.push('');

  // Warnings
  if (assessment.warnings.length > 0) {
    for (const warning of assessment.warnings) {
      lines.push(`  ⚠ ${warning}`);
    }
    lines.push('');
  }

  // Recommendations
  if (assessment.recommendedModels.length > 0) {
    lines.push('Recommended Models:');
    lines.push('');

    const viable = assessment.recommendedModels.filter(m => m.estimatedPerformance !== 'not-recommended');
    const notRecommended = assessment.recommendedModels.filter(m => m.estimatedPerformance === 'not-recommended');

    for (const model of viable.slice(0, 4)) {
      const perfIcon = model.estimatedPerformance === 'fast' ? '🚀' :
                       model.estimatedPerformance === 'moderate' ? '⚡' : '🐢';
      lines.push(`  ${perfIcon} ${model.modelId}`);
      lines.push(`     ${model.reason}`);
      if (model.warning) {
        lines.push(`     ⚠ ${model.warning}`);
      }
    }

    if (notRecommended.length > 0 && viable.length < 2) {
      lines.push('');
      lines.push('  May work but not recommended:');
      for (const model of notRecommended.slice(0, 2)) {
        lines.push(`  ⚠ ${model.modelId} - ${model.warning}`);
      }
    }
  }

  lines.push('');
  lines.push(assessment.suggestion);

  return lines.join('\n');
}
