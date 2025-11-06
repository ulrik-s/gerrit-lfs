// Copyright (C) 2019 The Android Open Source Project
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package com.googlesource.gerrit.plugins.lfs;

import com.google.common.collect.ImmutableMap;
import com.google.gerrit.acceptance.LightweightPluginDaemonTest;
import com.google.gerrit.acceptance.TestPlugin;
import com.google.gerrit.entities.Project;
import com.google.gerrit.testing.ConfigSuite;
import org.eclipse.jgit.lib.Config;
import org.junit.Test;

@TestPlugin(
    name = "lfs",
    sysModule = "com.googlesource.gerrit.plugins.lfs.Module",
    httpModule = "com.googlesource.gerrit.plugins.lfs.HttpModule",
    sshModule = "com.googlesource.gerrit.plugins.lfs.SshModule")
public class LfsIT extends LightweightPluginDaemonTest {
  @ConfigSuite.Default
  public static Config enablePlugin() {
    Config cfg = new Config();
    cfg.setString("lfs", null, "plugin", "lfs");
    return cfg;
  }

  @Test
  public void globalConfigCanBeReadByAdmin() throws Exception {
    adminRestSession.get(globalConfig(allProjects)).assertOK();
  }

  @Test
  public void globalConfigCannotBeReadByNonAdmin() throws Exception {
    userRestSession.get(globalConfig(allProjects)).assertNotFound();
  }

  @Test
  public void globalConfigCannotBeReadOnOtherProject() throws Exception {
    adminRestSession.get(globalConfig(project)).assertNotFound();
  }

  @Test
  public void projectConfigCanBeUpdatedByAdmin() throws Exception {
    adminRestSession
        .put(
            projectConfig(project),
            ImmutableMap.of("enabled", true, "read_only", false, "max_object_size", 1024))
        .assertOK();
    adminRestSession.get(projectConfig(project)).assertOK();
  }

  @Test
  public void projectConfigCannotBeUpdatedWithoutPermission() throws Exception {
    userRestSession
        .put(projectConfig(project), ImmutableMap.of("enabled", true))
        .assertForbidden();
  }

  private static String globalConfig(Project.NameKey name) {
    return String.format("/projects/%s/lfs:config-global", name.get());
  }

  private static String projectConfig(Project.NameKey name) {
    return String.format("/projects/%s/lfs:config-project", name.get());
  }
}
